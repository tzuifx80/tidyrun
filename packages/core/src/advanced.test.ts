import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createLeanAgent } from "./engine.js";
import { FileArtifactStore, JsonCommandCache } from "./store.js";
import { LeanAgentSecurityError } from "./errors.js";
import { WorkCache } from "./work-cache.js";
import { LeanMcpServer } from "./mcp.js";
import { compressOutput } from "./compress.js";
import { indexRepository } from "./repo.js";
import { handleGeminiHook } from "./hooks.js";
import { EventBus } from "./events.js";

function repo(): string {
  const root = mkdtempSync(join(tmpdir(), "leanagent-advanced-"));
  mkdirSync(join(root, "tests"));
  writeFileSync(join(root, "src.ts"), "export function greet(name: string) { return `hi ${name}`; }\n");
  writeFileSync(join(root, "tests", "src.test.ts"), "import { greet } from '../src';\n");
  return root;
}

describe("security and context", () => {
  it("rejects traversal and supports exact range reuse", async () => {
    const root = repo();
    const lean = await createLeanAgent({ repository: root, store: new FileArtifactStore(join(root, "arts")) });
    await expect(lean.readFile("../outside.txt")).rejects.toBeInstanceOf(LeanAgentSecurityError);
    const first = await lean.readFile("src.ts", { range: { start: 0, end: 10 } });
    expect(first.text).toBe("export fun");
    const second = await lean.readFile("src.ts", { range: { start: 0, end: 10 } });
    expect(second.text).toContain("UNCHANGED");
    const different = await lean.readFile("src.ts", { range: { start: 10, end: 20 } });
    expect(different.text).not.toContain("UNCHANGED");
  });
});

describe("event bus", () => {
  it("delivers typed and wildcard listeners", () => {
    const bus = new EventBus();
    let typed = 0;
    let wildcard = 0;
    bus.on("command.completed", () => { typed += 1; });
    bus.on("*", () => { wildcard += 1; });
    bus.emit({ type: "command.completed", ts: 1, sessionId: "s", cwd: ".", payload: {} });
    expect(typed).toBe(1);
    expect(wildcard).toBe(1);
  });

  it("isolates observer failures from the event producer", () => {
    const bus = new EventBus();
    bus.on("command.completed", () => { throw new Error("observer bug"); });
    expect(() => bus.emit({ type: "command.completed", ts: 1, sessionId: "s", cwd: ".", payload: {} })).not.toThrow();
  });

  it("records provider usage only when explicitly supplied", async () => {
    const root = repo();
    const lean = await createLeanAgent({ repository: root, store: new FileArtifactStore(join(root, "arts")) });
    lean.recordModelUsage({ provider: "fixture", model: "local", inputTokens: 10, outputTokens: 4 });
    expect(lean.session.stats.modelCalls).toBe(1);
    expect(lean.session.stats.modelInputTokens).toBe(10);
    lean.finish();
  });
});

describe("artifact and work caches", () => {
  it("redacts secrets and invalidates dependencies", () => {
    const root = join(mkdtempSync(join(tmpdir(), "leanagent-store-")), "arts");
    const store = new FileArtifactStore(root);
    const row = store.put({ kind: "command-result", cwd: root, full: "token=super-secret-value", compressed: "token=super-secret-value" });
    expect(store.readFull(row.id)).toContain("[REDACTED]");
    const cache = new WorkCache(join(mkdtempSync(join(tmpdir(), "leanagent-cache-")), "cache"));
    cache.put({ id: "x", type: "test", dependencies: { "src.ts": "a" }, payload: { ok: true } });
    expect(cache.get("x", { "src.ts": "a" })?.payload).toEqual({ ok: true });
    expect(cache.get("x", { "src.ts": "b" })).toBeUndefined();
  });

  it("invalidates same-repository command entries when a dependency is written", async () => {
    const root = repo();
    const commandCache = new JsonCommandCache(join(root, "cache"));
    const lean = await createLeanAgent({ repository: root, store: new FileArtifactStore(join(root, "arts")), commandCache });
    await lean.prepareCommand("pytest -q");
    lean.completeCommand("pytest -q", 0, "ok");
    writeFileSync(join(root, "src.ts"), "export const changed = true;\n");
    lean.noteWrite("src.ts");
    expect(lean.session.stats.cacheInvalidations).toBeGreaterThanOrEqual(1);
  });
});

describe("index, filters and MCP", () => {
  it("indexes imports, compresses cargo output and serves artifact tools", async () => {
    const root = repo();
    const idx = indexRepository(root);
    expect(idx.imports["tests/src.test.ts"]).toContain("../src");
    expect(compressOutput("cargo test", `${"ok\n".repeat(100)}test result: FAILED. 1 failed`, 200)).toContain("FAILED");
    const store = new FileArtifactStore(join(root, "arts"));
    const artifact = store.put({ kind: "command-result", cwd: root, full: "hello failure", compressed: "failure" });
    const mcp = new LeanMcpServer({ repository: root, store });
    const response = await mcp.handle({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "leanagent_get_artifact", arguments: { id: artifact.id } } });
    expect(JSON.stringify(response)).toContain(artifact.id);
    const resources = await mcp.handle({ jsonrpc: "2.0", id: 2, method: "resources/list" });
    expect(JSON.stringify(resources)).toContain("leanagent://repository/state");
  });

  it("returns a valid JSON hook response for Gemini session start", async () => {
    const response = await handleGeminiHook({ cwd: repo(), hook_event_name: "SessionStart" });
    expect(response.hookSpecificOutput).toBeTruthy();
  });

  it("compresses exposed Gemini shell output without claiming hidden events", async () => {
    const response = await handleGeminiHook({
      cwd: repo(),
      hook_event_name: "AfterTool",
      tool_name: "run_shell_command",
      tool_input: { command: "vitest run" },
      tool_response: { llmContent: `${"PASS unrelated\n".repeat(200)}FAIL src/auth.test.ts\nAssertionError: expected 401, received 200\n` },
    });
    expect(JSON.stringify(response)).toContain("additionalContext");
    expect(JSON.stringify(response)).toContain("FAIL");
  });
});
