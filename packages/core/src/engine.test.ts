import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createLeanAgent } from "./engine.js";
import { FileArtifactStore } from "./store.js";
import { compressOutput } from "./compress.js";
import { affectedTests, indexRepository } from "./repo.js";
import { parseLeanYaml } from "./config.js";
import { DEFAULT_CONFIG } from "./types.js";
import { classifyCommand, shouldUseFastPath } from "./util.js";

function tempRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "leanagent-"));
  writeFileSync(join(dir, "auth.ts"), "export const x = 1;\n");
  mkdirSync(join(dir, "tests"), { recursive: true });
  writeFileSync(join(dir, "tests", "auth.test.ts"), "import { x } from '../auth.ts'\n");
  writeFileSync(join(dir, "package-lock.json"), `${"{\"x\":1}".repeat(80)}\n`);
  return dir;
}

describe("duplicate reads", () => {
  it("reuses unchanged content and refetches after write", async () => {
    const root = tempRepo();
    const lean = await createLeanAgent({ repository: root, store: new FileArtifactStore(join(root, ".arts")) });
    const first = await lean.readFile("auth.ts");
    expect(first.text).toContain("export const x");
    const second = await lean.readFile("auth.ts");
    expect(second.text).toContain("LEANAGENT: UNCHANGED");
    lean.noteWrite("auth.ts");
    writeFileSync(join(root, "auth.ts"), "export const x = 2;\n");
    const third = await lean.readFile("auth.ts");
    expect(third.text).toContain("export const x = 2");
  });
});

describe("large file guard", () => {
  it("redirects lockfiles", async () => {
    const root = tempRepo();
    const lean = await createLeanAgent({ repository: root, store: new FileArtifactStore(join(root, ".arts")) });
    const result = await lean.readFile("package-lock.json");
    expect(result.text).toContain("LEANAGENT: LARGE FILE");
  });
});

describe("command cache", () => {
  it("reuses likely-safe commands when fingerprint matches", async () => {
    const root = tempRepo();
    const lean = await createLeanAgent({ repository: root, store: new FileArtifactStore(join(root, ".arts")) });
    const first = await lean.prepareCommand("pytest tests/auth");
    expect(first.some((d) => d.kind === "reuse")).toBe(false);
    lean.completeCommand("pytest tests/auth", 0, "1 passed");
    const second = await lean.prepareCommand("pytest tests/auth");
    expect(second.some((d) => d.kind === "reuse")).toBe(true);
  });

  it("does not cache destructive commands", async () => {
    const root = tempRepo();
    const lean = await createLeanAgent({ repository: root, store: new FileArtifactStore(join(root, ".arts")) });
    lean.completeCommand("rm -rf dist", 0, "ok");
    const second = await lean.prepareCommand("rm -rf dist");
    expect(second.some((d) => d.kind === "reuse")).toBe(false);
  });
});

describe("compression", () => {
  it("keeps pytest failures not the first N lines", () => {
    const raw = `${"ok\n".repeat(200)}FAILED tests/auth/test_refresh.py::test_expired\nAssertionError: expected 401\n1 failed, 284 passed`;
    const out = compressOutput("pytest", raw, 20000);
    expect(out).toContain("FAILED");
    expect(out).toContain("test_expired");
    expect(out.length).toBeLessThan(raw.length);
  });
});

describe("loop detector", () => {
  it("warns on repeated no-progress cycles and ignores mutating debug", async () => {
    const root = tempRepo();
    const lean = await createLeanAgent({ repository: root, store: new FileArtifactStore(join(root, ".arts")) });
    for (let i = 0; i < 6; i += 1) {
      await lean.readFile("auth.ts");
      lean.noteWrite; // no-op keep types
      await lean.prepareCommand("pytest tests/auth");
      lean.completeCommand("pytest tests/auth", 1, "FAILED");
    }
    const last = lean.session.stats.loopsDetected;
    expect(last).toBeGreaterThan(0);
    lean.noteWrite("auth.ts");
    await lean.readFile("auth.ts");
  });
});

describe("failed approach", () => {
  it("warns on identical retry", async () => {
    const root = tempRepo();
    const lean = await createLeanAgent({ repository: root, store: new FileArtifactStore(join(root, ".arts")) });
    lean.completeCommand("pytest tests/auth", 1, "boom");
    await lean.prepareCommand("pytest tests/auth");
    lean.completeCommand("pytest tests/auth", 1, "boom");
    const next = await lean.prepareCommand("pytest tests/auth");
    expect(next.some((d) => d.ruleId === "failed-approach")).toBe(true);
  });
});

describe("test impact", () => {
  it("selects nearby tests and explains why", () => {
    const root = tempRepo();
    const idx = indexRepository(root);
    const result = affectedTests(idx, ["auth.ts"]);
    expect(result.tests.some((t) => t.includes("auth"))).toBe(true);
    expect(Object.values(result.why).length).toBeGreaterThan(0);
  });
});

describe("config", () => {
  it("parses yaml without js-yaml", () => {
    const cfg = parseLeanYaml("preset: safe\nloops:\n  enabled: false\n", DEFAULT_CONFIG);
    expect(cfg.preset).toBe("safe");
    expect(cfg.loops.enabled).toBe(false);
    expect(cfg.telemetry).toBe(false);
  });

  it("parses block and inline arrays without losing repository overrides", () => {
    const cfg = parseLeanYaml("ignore:\n  - custom/**\ncontext:\n  max_file_bytes: 42\ndisabledRules: [loop-detection]\n", DEFAULT_CONFIG);
    expect(cfg.ignore).toEqual(["custom/**"]);
    expect(cfg.context.max_file_bytes).toBe(42);
    expect(cfg.disabledRules).toEqual(["loop-detection"]);
  });

  it("applies conservative preset defaults before explicit overrides", () => {
    const safe = parseLeanYaml("preset: safe\n", DEFAULT_CONFIG);
    const aggressive = parseLeanYaml("preset: aggressive\n", DEFAULT_CONFIG);
    expect(safe.commands.repeated_execution).toBe("off");
    expect(aggressive.context.max_tool_output_chars).toBe(12000);
  });
});

describe("classify", () => {
  it("labels command safety", () => {
    expect(classifyCommand("pytest -q")).toBe("LIKELY_SAFE");
    expect(classifyCommand("rm -rf src")).toBe("DESTRUCTIVE");
    expect(classifyCommand("npm install lodash")).toBe("STATEFUL");
  });

  it("uses the adaptive fast path only for cheap pure commands", () => {
    expect(shouldUseFastPath("node --version", DEFAULT_CONFIG)).toBe(true);
    expect(shouldUseFastPath("npm test", DEFAULT_CONFIG)).toBe(false);
    expect(shouldUseFastPath("echo ok | tee out.txt", DEFAULT_CONFIG)).toBe(false);
  });
});

describe("adaptive cost model", () => {
  it("does not persist a tiny, measured pure command", async () => {
    const root = tempRepo();
    const store = new FileArtifactStore(join(root, ".arts"));
    const lean = await createLeanAgent({ repository: root, store });
    const result = lean.completeCommand("node --version", 0, "v22.0.0\n", 1);
    expect(result.delivered).toBe("v22.0.0\n");
    expect(store.list()).toHaveLength(0);
    expect(lean.session.stats.overheadMs).toBe(0);
  });
});
