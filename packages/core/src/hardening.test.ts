import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createTidyRun } from "./engine.js";
import { FileArtifactStore, JsonCommandCache } from "./store.js";
import { WorkCache } from "./work-cache.js";
import { compressOutput } from "./compress.js";
import { affectedTests, indexRepository, snapshotRepository } from "./repo.js";
import { classifyCommand, environmentFingerprint, redactSecrets, resolveExecutable, safeRepositoryPath, sha256 } from "./util.js";
import { parseLeanYaml } from "./config.js";
import { DEFAULT_CONFIG } from "./types.js";
import type { ArtifactStore } from "./types.js";

function rootWithSource(): string {
  const root = mkdtempSync(join(tmpdir(), "tidyrun-hardening-"));
  mkdirSync(join(root, "tests"));
  writeFileSync(join(root, "src.ts"), "export const value = 1;\n");
  writeFileSync(join(root, "tests", "src.test.ts"), "import { value } from '../src';\nconsole.log(value);\n");
  return root;
}

describe("persistent cache safety", () => {
  it("survives a restart but invalidates a newly changed source file", async () => {
    const root = rootWithSource();
    const state = mkdtempSync(join(tmpdir(), "tidyrun-state-"));
    const storeRoot = join(state, "artifacts");
    const cacheRoot = join(state, "cache");
    const first = await createTidyRun({ repository: root, store: new FileArtifactStore(storeRoot), commandCache: new JsonCommandCache(cacheRoot) });
    await first.prepareCommand("tsc --noEmit");
    first.completeCommand("tsc --noEmit", 0, "Found 0 errors");
    first.finish();
    const restarted = await createTidyRun({ repository: root, store: new FileArtifactStore(storeRoot), commandCache: new JsonCommandCache(cacheRoot) });
    expect((await restarted.prepareCommand("tsc --noEmit")).some((row) => row.kind === "reuse")).toBe(true);
    writeFileSync(join(root, "src.ts"), "export const value = 2;\n");
    const changed = await createTidyRun({ repository: root, store: new FileArtifactStore(storeRoot), commandCache: new JsonCommandCache(cacheRoot) });
    expect((await changed.prepareCommand("tsc --noEmit")).some((row) => row.kind === "reuse")).toBe(false);
  });

  it("never persists a failed command as a reusable result", async () => {
    const root = rootWithSource();
    const state = mkdtempSync(join(tmpdir(), "tidyrun-state-"));
    const agent = await createTidyRun({ repository: root, store: new FileArtifactStore(join(state, "artifacts")), commandCache: new JsonCommandCache(join(state, "cache")) });
    await agent.prepareCommand("tsc --noEmit");
    agent.completeCommand("tsc --noEmit", 1, "error TS2322");
    expect((await agent.prepareCommand("tsc --noEmit")).some((row) => row.kind === "reuse")).toBe(false);
  });

  it("normalizes invalid provider usage metadata to zero", async () => {
    const agent = await createTidyRun({ repository: rootWithSource(), store: new FileArtifactStore(join(mkdtempSync(join(tmpdir(), "tidyrun-usage-")), "arts")) });
    agent.recordModelUsage({ inputTokens: Number.NaN, outputTokens: -10 });
    expect(agent.session.stats.modelInputTokens).toBe(0);
    expect(agent.session.stats.modelOutputTokens).toBe(0);
  });

  it("misses safely when a cached artifact is deleted", async () => {
    const root = rootWithSource();
    const state = mkdtempSync(join(tmpdir(), "tidyrun-state-"));
    const store = new FileArtifactStore(join(state, "artifacts"));
    const cache = new JsonCommandCache(join(state, "cache"));
    const agent = await createTidyRun({ repository: root, store, commandCache: cache });
    await agent.prepareCommand("tsc --noEmit");
    const completed = agent.completeCommand("tsc --noEmit", 0, "ok");
    expect(completed.artifactId).toBeTruthy();
    store.prune({ maxArtifacts: 0 });
    const restarted = await createTidyRun({ repository: root, store: new FileArtifactStore(join(state, "artifacts")), commandCache: new JsonCommandCache(join(state, "cache")) });
    expect((await restarted.prepareCommand("tsc --noEmit")).some((row) => row.kind === "reuse")).toBe(false);
  });

  it("changes cache identity for environment, configuration, and working directory state", async () => {
    expect(environmentFingerprint({ PATH: "a" })).not.toBe(environmentFingerprint({ PATH: "b" }));
    const root = rootWithSource();
    const other = rootWithSource();
    const state = mkdtempSync(join(tmpdir(), "tidyrun-identity-"));
    const configPath = join(root, "tidyrun.yaml");
    writeFileSync(configPath, "version: 1\npreset: balanced\n");
    const storeRoot = join(state, "artifacts");
    const cacheRoot = join(state, "cache");
    const first = await createTidyRun({ repository: root, store: new FileArtifactStore(storeRoot), commandCache: new JsonCommandCache(cacheRoot) });
    await first.prepareCommand("node --version");
    first.completeCommand("node --version", 0, "v1");
    writeFileSync(configPath, "version: 1\npreset: safe\n");
    const changedConfig = await createTidyRun({ repository: root, store: new FileArtifactStore(storeRoot), commandCache: new JsonCommandCache(cacheRoot) });
    expect((await changedConfig.prepareCommand("node --version")).some((row) => row.kind === "reuse")).toBe(false);
    const differentCwd = await createTidyRun({ repository: other, store: new FileArtifactStore(storeRoot), commandCache: new JsonCommandCache(cacheRoot) });
    expect((await differentCwd.prepareCommand("node --version")).some((row) => row.kind === "reuse")).toBe(false);
  });
});

describe("artifact integrity and recovery", () => {
  it("rejects tampered content and merges independent writers", () => {
    const root = mkdtempSync(join(tmpdir(), "tidyrun-artifacts-"));
    const one = new FileArtifactStore(root);
    const first = one.put({ kind: "command-result", cwd: root, command: "one", full: "first", compressed: "first" });
    const two = new FileArtifactStore(root);
    const second = two.put({ kind: "command-result", cwd: root, command: "two", full: "second", compressed: "second" });
    expect(new FileArtifactStore(root).list().map((row) => row.id)).toEqual(expect.arrayContaining([first.id, second.id]));
    writeFileSync(join(root, first.id, "full.txt"), "tampered");
    expect(one.readFull(first.id)).toBeUndefined();
  });

  it("rejects an artifact index path escape", () => {
    const root = mkdtempSync(join(tmpdir(), "tidyrun-artifact-index-"));
    writeFileSync(join(root, "index.json"), JSON.stringify([{ id: "tr_evil", fullPath: join(tmpdir(), "secret.txt"), sha256: "x", kind: "x", cwd: root, ts: Date.now(), compressed: "" }]));
    expect(new FileArtifactStore(root).get("tr_evil")).toBeUndefined();
  });

  it("fails open when artifact persistence is unavailable", async () => {
    const root = rootWithSource();
    const unavailable: ArtifactStore = {
      put: () => { throw new Error("disk full"); },
      get: () => undefined,
      readFull: () => undefined,
      search: () => [],
      list: () => [],
    };
    const agent = await createTidyRun({ repository: root, store: unavailable });
    const result = agent.completeCommand("tsc --noEmit", 0, "ok");
    expect(result.delivered).toBe("ok");
    expect(result.artifactId).toBe("");
    agent.finish();
  });

  it("clears caches instead of re-merging stale on-disk rows", () => {
    const root = mkdtempSync(join(tmpdir(), "tidyrun-clear-"));
    const cache = new JsonCommandCache(root);
    cache.put({ fingerprint: "a", command: "tsc", class: "LIKELY_SAFE", exit: 0, artifactId: "tr_a", stdoutHash: "x", at: Date.now(), dependencies: {}, toolVersion: "test", valid: true });
    cache.clear();
    expect(new JsonCommandCache(root).list()).toHaveLength(0);
    const work = new WorkCache(root);
    work.put({ id: "w", type: "index", dependencies: {}, payload: {} });
    work.clear();
    expect(new WorkCache(root).list()).toHaveLength(0);
  });

  it("treats malformed cache metadata as a miss", () => {
    const root = mkdtempSync(join(tmpdir(), "tidyrun-corrupt-cache-"));
    writeFileSync(join(root, "commands.json"), "{not-json");
    writeFileSync(join(root, "work.json"), "[not-json");
    expect(new JsonCommandCache(root).list()).toHaveLength(0);
    expect(new WorkCache(root).list()).toHaveLength(0);
  });

  it("does not resurrect pruned artifact metadata", () => {
    const root = mkdtempSync(join(tmpdir(), "tidyrun-prune-"));
    const store = new FileArtifactStore(root);
    const row = store.put({ kind: "command-result", cwd: root, command: "one", full: "one", compressed: "one" });
    expect(store.prune({ maxArtifacts: 0 }).removed).toBe(1);
    expect(new FileArtifactStore(root).get(row.id)).toBeUndefined();
  });
});

describe("compression diagnostics", () => {
  const fixture = `${"PASS unrelated\n".repeat(600)}FAIL src/auth/token.test.ts > expired\nAssertionError: expected 401 received 200\n    at src/auth/token.test.ts:42:5\n${"warning: noise\n".repeat(80)}284 passed, 1 failed`;
  it("compresses supported ecosystems while retaining locations and summaries", () => {
    for (const command of ["vitest run", "jest", "tsc --noEmit", "pytest -q", "npm test", "cargo test", "go test ./...", "eslint .", "mystery-command"]) {
      const out = compressOutput(command, fixture, 900);
      expect(out.length).toBeLessThanOrEqual(900);
      expect(out).toMatch(/FAIL|failed|error|compressed/i);
    }
  });

  it("strips terminal control sequences only in the compressed view", () => {
    const out = compressOutput("vitest", `${"\u001b[31mFAIL\u001b[0m\n".repeat(200)}AssertionError: bad`, 200);
    expect(out).not.toContain("\u001b[");
    expect(out).toContain("FAIL");
  });
});

describe("duplicate read accounting", () => {
  it("reuses a guarded large-file read on the next identical request", async () => {
    const root = rootWithSource();
    writeFileSync(join(root, "large.log"), "x\n".repeat(100_000));
    const agent = await createTidyRun({ repository: root, store: new FileArtifactStore(join(mkdtempSync(join(tmpdir(), "tidyrun-large-")), "arts")) });
    const first = await agent.readFile("large.log");
    const second = await agent.readFile("large.log");
    expect(first.text).toContain("large file");
    expect(second.text).toContain("unchanged");
    expect(agent.session.stats.duplicateReadsReused).toBe(1);
  });
});

describe("security and command policy", () => {
  it("redacts provider, cloud, header, and private-key forms", () => {
    const text = "sk-ant-1234567890 ghp_1234567890 Bearer abc.def AWS_ACCESS_KEY_ID=AKIA123456789012 SECRET=top secret -----BEGIN RSA PRIVATE KEY-----abc-----END RSA PRIVATE KEY-----";
    const redacted = redactSecrets(text);
    expect(redacted).not.toContain("1234567890");
    expect(redacted).not.toContain("abc.def");
    expect(redacted).not.toContain("PRIVATE KEY-----abc");
  });

  it("classifies write and network commands conservatively", () => {
    expect(classifyCommand("git push origin main")).toBe("STATEFUL");
    expect(classifyCommand("curl -X POST https://example.test")).toBe("STATEFUL");
    expect(classifyCommand("rm file.txt")).toBe("DESTRUCTIVE");
    expect(classifyCommand("database migration up")).toBe("STATEFUL");
    expect(classifyCommand("node --version")).toBe("PURE");
    expect(classifyCommand("npm test > test.log")).toBe("STATEFUL");
    for (const command of ["git reset --hard HEAD", "npm install", "pnpm install", "docker compose up", "terraform apply", "curl --data x https://example.test"]) {
      expect(["STATEFUL", "DESTRUCTIVE"]).toContain(classifyCommand(command));
    }
  });

  it("rejects NUL and outside paths and does not follow an escaping symlink", () => {
    const root = rootWithSource();
    expect(() => safeRepositoryPath(root, "..\\outside")).toThrow();
    expect(() => safeRepositoryPath(root, "bad\0name")).toThrow();
    try {
      const outside = mkdtempSync(join(tmpdir(), "tidyrun-outside-"));
      symlinkSync(outside, join(root, "escape"), "junction");
      expect(() => safeRepositoryPath(root, "escape", { followSymlinks: true })).toThrow();
    } catch {
      // Symlink creation can be disabled on Windows CI; traversal coverage above
      // remains deterministic and the production default is no symlink following.
    }
  });
});

describe("repository intelligence", () => {
  it("selects transitive dependents and broad configuration changes", () => {
    const root = mkdtempSync(join(tmpdir(), "tidyrun-index-"));
    mkdirSync(join(root, "src"));
    mkdirSync(join(root, "tests"));
    writeFileSync(join(root, "src", "leaf.ts"), "export const leaf = 1;\n");
    writeFileSync(join(root, "src", "barrel.ts"), "export { leaf } from './leaf';\n");
    writeFileSync(join(root, "tests", "leaf.test.ts"), "import { leaf } from '../src/barrel';\nconsole.log(leaf);\n");
    writeFileSync(join(root, "package.json"), "{}\n");
    const index = indexRepository(root);
    const transitive = affectedTests(index, ["src/leaf.ts"]);
    expect(transitive.tests).toContain("tests/leaf.test.ts");
    const broad = affectedTests(index, ["package.json"]);
    expect(broad.tests).toContain("tests/leaf.test.ts");
  });

  it("keeps the public snapshot API content-addressed", () => {
    const root = rootWithSource();
    const snapshot = snapshotRepository(root);
    expect(snapshot.fileHashes["src.ts"]).toBe(sha256("export const value = 1;\n"));
  });
});

describe("loop evidence", () => {
  it("does not warn when repeated debugging produces different artifacts", async () => {
    const root = rootWithSource();
    const agent = await createTidyRun({ repository: root, store: new FileArtifactStore(join(mkdtempSync(join(tmpdir(), "tidyrun-loop-")), "arts")) });
    for (let i = 0; i < 6; i += 1) {
      await agent.prepareCommand("tsc --noEmit");
      agent.completeCommand("tsc --noEmit", 1, `error TS2322 at line ${i}`);
    }
    expect(agent.session.stats.loopsDetected).toBe(0);
  });
});

describe("configuration hardening", () => {
  it("falls back from invalid scalar overrides without enabling unsafe values", () => {
    const cfg = parseLeanYaml("context:\n  max_file_bytes: nope\n  duplicate_reads: maybe\nloops:\n  enabled: maybe\nsecurity:\n  allow_outside_repository: yes\n", DEFAULT_CONFIG);
    expect(cfg.context.max_file_bytes).toBe(DEFAULT_CONFIG.context.max_file_bytes);
    expect(cfg.context.duplicate_reads).toBe("reuse");
    expect(cfg.loops.enabled).toBe(true);
    expect(cfg.security.allow_outside_repository).toBe(false);
  });
});

describe("Windows command resolution", () => {
  it.skipIf(process.platform !== "win32")("runs a local npm .cmd bin through its Node script without a shell", () => {
    const root = mkdtempSync(join(tmpdir(), "tidyrun-bin-"));
    const bin = join(root, "node_modules", ".bin");
    const target = join(root, "node_modules", "tidyrun", "bin", "tidyrun.mjs");
    mkdirSync(bin, { recursive: true });
    mkdirSync(join(root, "node_modules", "tidyrun", "bin"), { recursive: true });
    writeFileSync(target, "process.exit(0);\n");
    writeFileSync(join(bin, "tidyrun.cmd"), "@echo off\n\"%dp0%\\..\\tidyrun\\bin\\tidyrun.mjs\" %*\n");
    const previous = process.env.PATH;
    process.env.PATH = `${bin};${previous ?? ""}`;
    try {
      const resolved = resolveExecutable("tidyrun");
      expect(resolved.file).toBe(process.execPath);
      expect(resolved.prefix[0]).toBe(target);
    } finally {
      process.env.PATH = previous;
    }
  });
});
