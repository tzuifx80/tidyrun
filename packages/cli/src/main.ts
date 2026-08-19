#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync, accessSync, constants } from "node:fs";
import { performance } from "node:perf_hooks";
import { join, dirname } from "node:path";
import {
  createLeanAgent,
  detectStack,
  FileArtifactStore,
  JsonCommandCache,
  homeDir,
  indexRepository,
  affectedTests,
  detectBuildSystems,
  loadConfig,
  writeDefaultConfig,
  disableRule,
  builtinRules,
  agentAdapters,
  detectAdapters,
  LeanMcpServer,
  latestSessionStats,
  statsSummary,
  loadBenchmark,
  runBenchmark,
  benchmarkMarkdown,
  handleGeminiHook,
  resolveExecutable,
  shouldUseFastPath,
} from "@leanagent/core";
import { LEAN_MARK_END, LEAN_MARK_START, upsertBlock } from "./sync.js";

async function main(argv = process.argv.slice(2)): Promise<number> {
  const jsonMode = argv.includes("--json");
  const quiet = argv.includes("--quiet") || argv.includes("-q");
  const raw = argv.includes("--raw");
  const last = argv.includes("--last");
  const args = argv.filter((item) => !["--json", "--quiet", "-q", "--raw", "--last"].includes(item));
  const cmd = args[0] ?? "help";
  const rest = args.slice(1);
  const cwd = process.cwd();

  try {
    if (["help", "-h", "--help"].includes(cmd)) { printHelp(); return 0; }
    if (cmd === "init") return initCmd(cwd, quiet, jsonMode);
    if (cmd === "run") return await runCmd(cwd, rest, raw);
    if (cmd === "status") return statusCmd(cwd, jsonMode);
    if (cmd === "tests" || cmd === "affected-tests") return affectedTestsCmd(cwd, rest, jsonMode);
    if (cmd === "stats") return statsCmd(jsonMode, last);
    if (cmd === "doctor") return doctorCmd(cwd, jsonMode);
    if (cmd === "sync") return syncCmd(cwd, quiet, jsonMode);
    if (cmd === "config") return configCmd(cwd, jsonMode);
    if (cmd === "cache") return cacheCmd(rest, jsonMode);
    if (cmd === "show" || cmd === "cat" || cmd === "search") return artifactCmd(cmd, rest);
    if (cmd === "rules") return rulesCmd(cwd, rest, jsonMode);
    if (cmd === "adapters") return adaptersCmd(cwd, jsonMode);
    if (cmd === "mcp") return mcpCmd(cwd);
    if (cmd === "hook") return await hookCmd(rest[0] ?? "", cwd);
    if (cmd === "benchmark") return await benchmarkCmd(cwd, rest[0], jsonMode);
    if (cmd === "ci") return ciCmd(cwd, jsonMode);
    if (cmd === "clean") return cleanCmd(rest, jsonMode);
    printHelp();
    return 2;
  } catch (error) {
    process.stderr.write(`leanagent: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

function printHelp(): void {
  process.stdout.write(`leanagent — local-first optimization runtime for coding agents

  leanagent init
  leanagent run -- <command>
  leanagent status [--json]
  leanagent tests --changed <file> [file...]
  leanagent stats [--last] [--json]
  leanagent doctor [--json]
  leanagent sync
  leanagent config
  leanagent cache [stats|list|clear|prune]
  leanagent show <artifact>
  leanagent cat <artifact>
  leanagent search <artifact> <term>
  leanagent rules list|disable <rule>
  leanagent adapters
  leanagent mcp
  leanagent hook gemini   # JSON stdin/stdout hook handler
  leanagent benchmark <fixture.json|yaml>
  leanagent ci
  leanagent clean [--artifacts]

No API key. No extra model. LEANAGENT_BYPASS=1 disables optimizations.
`);
}

function initCmd(cwd: string, quiet: boolean, jsonMode: boolean): number {
  const configPath = writeDefaultConfig(cwd);
  const stack = detectStack(cwd);
  const adapters = detectAdapters(cwd).filter((adapter) => adapter.id !== "generic");
  const index = indexRepository(cwd);
  syncCmd(cwd, true, false);
  const payload = { configPath, detected: stack, adapters: adapters.map((adapter) => adapter.id), indexedFiles: index.files.length, indexedTests: index.tests.length, telemetry: false, enabled: ["duplicate-read", "large-file", "repeated-command", "loop-detection", "output-compression", "incremental-test-impact"] };
  if (jsonMode) { process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`); return 0; }
  if (!quiet) process.stdout.write(`LeanAgent Setup\n\nConfiguration\n✓ configuration installed\n✓ repository indexed (${payload.indexedFiles} files, ${payload.indexedTests} tests)\n${adapters.length ? adapters.map((adapter) => `✓ ${adapter.name} detected`).join("\n") : "✓ generic wrapper available"}\n\nEnabled\n${payload.enabled.map((item) => `✓ ${item}`).join("\n")}\n\nNo API key required.\nNo telemetry enabled.\n\nYou're ready.\n`);
  return 0;
}

async function runCmd(cwd: string, rest: string[], raw: boolean): Promise<number> {
  const rawParts = rest[0] === "--" ? rest.slice(1) : rest;
  const parts = rawParts.length === 1 ? tokenize(rawParts[0]) : rawParts;
  if (!parts.length || !parts[0]) { process.stderr.write("usage: leanagent run -- <command>\n"); return 2; }
  const command = parts.join(" ");
  // Classify before constructing LeanAgent. Pure version/help/echo commands
  // are too cheap to repay a repository snapshot and artifact roundtrip.
  const config = loadConfig(cwd);
  if (shouldUseFastPath(command, config)) {
    const result = await spawnCapture(parts, cwd);
    process.stdout.write(result.output + (result.output.endsWith("\n") ? "" : "\n"));
    return result.exit;
  }
  const lean = await createLeanAgent({ repository: cwd });
  const identity = JSON.stringify(parts);
  const prepared = await lean.prepareCommand(command, { identity });
  const reuse = prepared.find((decision) => decision.kind === "reuse");
  if (reuse?.message) {
    process.stdout.write(`${reuse.message}\n`);
    lean.finish();
    const cachedExit = reuse.artifactId ? lean.store.get(reuse.artifactId)?.exit : undefined;
    return cachedExit ?? 0;
  }
  const warn = prepared.find((decision) => decision.kind === "warn");
  if (warn?.message) process.stderr.write(`${warn.message}\n`);
  const result = await spawnCapture(parts, cwd);
  const done = lean.completeCommand(command, result.exit, result.output, result.durationMs, { identity });
  lean.finish();
  const output = raw ? result.output : done.delivered;
  process.stdout.write(output + (output.endsWith("\n") ? "" : "\n"));
  return result.exit;
}

function spawnCapture(argv: string[], cwd: string): Promise<{ exit: number; output: string; durationMs: number }> {
  return new Promise((resolve) => {
    const started = performance.now();
    const resolved = resolveExecutable(argv[0]);
    const child = spawn(resolved.file, [...resolved.prefix, ...argv.slice(1)], { cwd, shell: false, windowsHide: true, env: process.env });
    let output = "";
    let settled = false;
    const timeoutMs = Number(process.env.LEANAGENT_TIMEOUT_MS ?? 0);
    child.stdout.on("data", (chunk: Buffer) => { output += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { output += chunk.toString(); });
    const stop = () => { if (!child.killed) child.kill(); };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    const timer = timeoutMs > 0 ? setTimeout(() => { stop(); settle(124, `${output}\nLeanAgent command timeout after ${timeoutMs}ms`); }, timeoutMs) : undefined;
    const settle = (exit: number, finalOutput = output) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      process.removeListener("SIGINT", stop);
      process.removeListener("SIGTERM", stop);
      resolve({ exit, output: finalOutput, durationMs: performance.now() - started });
    };
    child.on("close", (code) => settle(code ?? 1));
    child.on("error", (err) => settle(1, `${output}${String(err)}`));
  });
}

function statusCmd(cwd: string, jsonMode: boolean): number {
  const idx = indexRepository(cwd);
  const payload = { cwd, files: idx.files.length, tests: idx.tests.length, languages: idx.languages, packages: idx.packages, generated: idx.generated.length, buildSystems: detectBuildSystems(cwd), home: homeDir() };
  process.stdout.write(jsonMode ? `${JSON.stringify(payload, null, 2)}\n` : `LeanAgent repo ${cwd}\nfiles ${payload.files} tests ${payload.tests} langs ${payload.languages.join(",") || "unknown"} packages ${payload.packages.length} build ${payload.buildSystems.join(",") || "unknown"}\n`);
  return 0;
}

function affectedTestsCmd(cwd: string, rest: string[], jsonMode: boolean): number {
  const changed = rest[0] === "--changed" ? rest.slice(1) : rest;
  if (!changed.length) { process.stderr.write("usage: leanagent tests --changed <file> [file...]\n"); return 2; }
  const result = affectedTests(indexRepository(cwd), changed);
  process.stdout.write(jsonMode ? `${JSON.stringify(result, null, 2)}\n` : `${result.tests.map((test) => `✓ ${test} — ${result.why[test]}`).join("\n")}\n`);
  return 0;
}

function statsCmd(jsonMode: boolean, _last: boolean): number {
  const latest = latestSessionStats(new FileArtifactStore());
  if (!latest) { process.stdout.write("No completed LeanAgent sessions recorded.\n"); return 0; }
  if (jsonMode) { process.stdout.write(`${JSON.stringify({ artifact: latest.id, stats: latest.stats, summary: latest.stats ? statsSummary(latest.stats) : undefined }, null, 2)}\n`); return 0; }
  process.stdout.write(latest.raw + "\n");
  return 0;
}

function configCmd(cwd: string, jsonMode: boolean): number {
  const cfg = loadConfig(cwd);
  process.stdout.write(jsonMode ? `${JSON.stringify(cfg, null, 2)}\n` : `${JSON.stringify(cfg, null, 2)}\n`);
  return 0;
}

function doctorCmd(cwd: string, jsonMode: boolean): number {
  const checks: Array<{ id: string; status: "PASS" | "WARN" | "FAIL"; detail: string; fix?: string }> = [];
  const cfg = loadConfig(cwd);
  try { accessSync(homeDir(), constants.W_OK); checks.push({ id: "home-writable", status: "PASS", detail: homeDir() }); }
  catch { checks.push({ id: "home-writable", status: "FAIL", detail: homeDir(), fix: `Create a writable LEANAGENT_HOME (currently ${homeDir()}).` }); }
  const store = new FileArtifactStore();
  const artifacts = store.list();
  const corruptArtifacts = artifacts.filter((row) => !store.readFull(row.id));
  checks.push(corruptArtifacts.length ? { id: "artifacts", status: "WARN", detail: `${corruptArtifacts.length} unreadable of ${artifacts.length}`, fix: "Run `leanagent cache prune` or `leanagent clean --artifacts`." } : { id: "artifacts", status: "PASS", detail: `${artifacts.length} readable artifact(s)` });
  const commandCache = new JsonCommandCache();
  const missingCachedArtifacts = commandCache.list().filter((row) => row.valid !== false && !store.get(row.artifactId));
  checks.push(missingCachedArtifacts.length ? { id: "command-cache", status: "WARN", detail: `${missingCachedArtifacts.length} entry(s) reference missing artifacts`, fix: "Run `leanagent cache clear` to rebuild safely." } : { id: "command-cache", status: "PASS", detail: `${commandCache.list().length} entry(s)` });
  const idx = indexRepository(cwd);
  checks.push(idx.files.length ? { id: "repository", status: "PASS", detail: `${idx.files.length} indexed file(s), ${idx.tests.length} test(s)` } : { id: "repository", status: "WARN", detail: "No supported source files detected", fix: "Run doctor from the repository root or use the generic wrapper." });
  const managedTargets = [join(cwd, "AGENTS.md"), join(cwd, "CLAUDE.md"), join(cwd, "GEMINI.md")].filter((path) => existsSync(path));
  const staleRules = managedTargets.filter((path) => !readFileSync(path, "utf8").includes(LEAN_MARK_START) || !readFileSync(path, "utf8").includes(LEAN_MARK_END));
  checks.push(staleRules.length ? { id: "managed-rules", status: "WARN", detail: `${staleRules.length} managed file(s) missing markers`, fix: "Run `leanagent sync`." } : { id: "managed-rules", status: "PASS", detail: managedTargets.length ? `${managedTargets.length} managed file(s)` : "No managed provider rules detected" });
  checks.push(cfg.telemetry === false ? { id: "telemetry", status: "PASS", detail: "disabled" } : { id: "telemetry", status: "FAIL", detail: "configuration attempted to enable telemetry", fix: "Telemetry is intentionally disabled; remove the invalid override." });
  const status = checks.some((check) => check.status === "FAIL") ? "FAIL" : checks.some((check) => check.status === "WARN") ? "REVIEW" : "HEALTHY";
  const report = { telemetry: cfg.telemetry, artifactCount: artifacts.length, rules: builtinRules.map((rule) => rule.id), preset: cfg.preset, platform: process.platform, node: process.version, status, checks, fixes: checks.filter((check) => check.fix).map((check) => check.fix) };
  process.stdout.write(jsonMode ? `${JSON.stringify(report, null, 2)}\n` : `doctor: preset=${report.preset} telemetry=off artifacts=${report.artifactCount} ${report.status}\n${checks.map((check) => `${check.status === "PASS" ? "✓" : check.status === "WARN" ? "!" : "✗"} ${check.id}: ${check.detail}${check.fix ? ` — ${check.fix}` : ""}`).join("\n")}\n`);
  return status === "FAIL" ? 1 : 0;
}

function syncCmd(cwd: string, quiet: boolean, jsonMode: boolean): number {
  const block = `${LEAN_MARK_START}\n\n## LeanAgent efficiency rules\n\n- Avoid rereading unchanged files; LeanAgent returns a content-hash notice.\n- Prefer targeted searches over repository-wide dumps.\n- Do not repeat identical failed commands; fetch stored LA:// artifacts instead.\n- Use incremental verification while iterating and complete final verification at task completion.\n- Retrieve full LeanAgent artifacts only when necessary: leanagent cat <id>.\n- Wrap commands with leanagent run -- <cmd> when native hooks are unavailable.\n- Extra LLM calls required by LeanAgent: 0.\n\n${LEAN_MARK_END}`;
  const targets = [join(cwd, "AGENTS.md"), join(cwd, "CLAUDE.md"), join(cwd, "GEMINI.md"), join(cwd, ".cursor", "rules", "leanagent.mdc"), join(cwd, ".clinerules", "leanagent.md"), join(cwd, ".roo", "leanagent.md")];
  const updated: string[] = [];
  for (const path of targets) {
    const optionalTarget = path.includes(".cursor") || path.includes(".clinerules") || path.includes(".roo");
    if (!existsSync(path) && !path.endsWith("AGENTS.md") && !path.endsWith("CLAUDE.md") && !(optionalTarget && existsSync(dirname(path)))) continue;
    mkdirSync(dirname(path), { recursive: true });
    const prev = existsSync(path) ? readFileSync(path, "utf8") : "";
    const next = upsertBlock(prev, block);
    if (next !== prev) { writeFileSync(path, next, "utf8"); updated.push(path); }
  }
  if (jsonMode) process.stdout.write(`${JSON.stringify({ updated }, null, 2)}\n`);
  else if (!quiet) process.stdout.write(`Synced LeanAgent managed sections into ${updated.length} instruction file(s).\n`);
  return 0;
}

function cacheCmd(rest: string[], jsonMode: boolean): number {
  const store = new FileArtifactStore();
  const commandCache = new JsonCommandCache();
  const rows = store.list();
  if (rest[0] === "clear") { store.prune({ maxArtifacts: 0 }); commandCache.clear(); process.stdout.write("artifact and command caches cleared\n"); return 0; }
  if (rest[0] === "prune") { const result = store.prune({ maxArtifacts: loadConfig(process.cwd()).storage.max_artifacts, maxBytes: loadConfig(process.cwd()).storage.max_artifact_bytes }); process.stdout.write(`${JSON.stringify(result)}\n`); return 0; }
  if (rest[0] === "list") { process.stdout.write(`${JSON.stringify({ artifacts: rows, commands: commandCache.list() }, null, 2)}\n`); return 0; }
  const payload = { artifacts: rows.length, bytes: rows.reduce((sum, row) => sum + (row.fullBytes ?? 0), 0), commandEntries: commandCache.list().length, root: join(homeDir(), "artifacts") };
  process.stdout.write(jsonMode ? `${JSON.stringify(payload, null, 2)}\n` : `artifacts ${payload.artifacts} bytes ${payload.bytes} under ${payload.root}\n`);
  return 0;
}

function artifactCmd(cmd: string, rest: string[]): number {
  const id = rest[0];
  if (!id) { process.stderr.write(`usage: leanagent ${cmd} <artifact>\n`); return 2; }
  const store = new FileArtifactStore();
  if (cmd === "search") {
    const hits = store.search(id, rest.slice(1).join(" "));
    process.stdout.write(`${hits.join("\n")}${hits.length ? "\n" : ""}`);
    return hits.length ? 0 : 1;
  }
  const rec = store.get(id);
  if (!rec) { process.stderr.write(`unknown artifact ${id}\n`); return 1; }
  if (cmd === "show") process.stdout.write(`${JSON.stringify(rec, null, 2)}\n`);
  else process.stdout.write(`${store.readFull(id) ?? ""}\n`);
  return 0;
}

function rulesCmd(cwd: string, rest: string[], jsonMode: boolean): number {
  if (rest[0] === "list" || !rest[0]) {
    const rows = builtinRules.map((rule) => ({ id: rule.id, description: rule.description }));
    process.stdout.write(jsonMode ? `${JSON.stringify(rows, null, 2)}\n` : `${rows.map((row) => `${row.id}\t${row.description}`).join("\n")}\n`);
    return 0;
  }
  if (rest[0] === "disable" && rest[1]) { const path = disableRule(cwd, rest[1]); process.stdout.write(`disabled ${rest[1]} in ${path}\n`); return 0; }
  return 2;
}

function adaptersCmd(cwd: string, jsonMode: boolean): number {
  const detected = new Set(detectAdapters(cwd).map((adapter) => adapter.id));
  const rows = agentAdapters.map((adapter) => ({ id: adapter.id, name: adapter.name, mode: adapter.mode, detected: detected.has(adapter.id), capabilities: adapter.capabilities, description: adapter.describe() }));
  process.stdout.write(jsonMode ? `${JSON.stringify(rows, null, 2)}\n` : `${rows.map((row) => `${row.id}\t${row.detected ? "detected" : "available"}\t${row.mode}\t${row.description}`).join("\n")}\n`);
  return 0;
}

async function mcpCmd(cwd: string): Promise<number> { await new LeanMcpServer({ repository: cwd }).serve(); return 0; }

async function hookCmd(kind: string, cwd: string): Promise<number> {
  if (kind !== "gemini") { process.stderr.write("usage: leanagent hook gemini\n"); return 2; }
  const input = await readStdin();
  const payload = await handleGeminiHook({ ...(JSON.parse(input) as Record<string, unknown>), cwd });
  process.stdout.write(`${JSON.stringify(payload)}\n`);
  return 0;
}

function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return Promise.resolve("");
  return new Promise((resolve, reject) => { let value = ""; process.stdin.setEncoding("utf8"); process.stdin.on("data", (chunk) => { value += chunk; }); process.stdin.on("end", () => resolve(value)); process.stdin.on("error", reject); });
}

async function benchmarkCmd(cwd: string, file: string | undefined, jsonMode: boolean): Promise<number> {
  if (!file) { process.stderr.write("usage: leanagent benchmark <fixture.json|yaml>\n"); return 2; }
  const spec = loadBenchmark(file);
  if (!spec.repository) spec.repository = cwd;
  const report = await runBenchmark(spec);
  mkdirSync(join(cwd, "benchmarks"), { recursive: true });
  writeFileSync(join(cwd, "benchmarks", "last-report.json"), JSON.stringify(report, null, 2), "utf8");
  writeFileSync(join(cwd, "benchmarks", "last-report.md"), benchmarkMarkdown(report), "utf8");
  process.stdout.write(jsonMode ? `${JSON.stringify(report, null, 2)}\n` : `${benchmarkMarkdown(report)}\n`);
  return report.quality.equalExit ? 0 : 1;
}

function ciCmd(cwd: string, jsonMode: boolean): number {
  const cfg = loadConfig(cwd);
  const idx = indexRepository(cwd);
  const payload = { configValid: cfg.telemetry === false, telemetry: cfg.telemetry, files: idx.files.length, tests: idx.tests.length, localOnly: true };
  process.stdout.write(jsonMode ? `${JSON.stringify(payload, null, 2)}\n` : `leanagent ci: config=${payload.configValid ? "ok" : "invalid"} files=${payload.files} tests=${payload.tests} telemetry=off\n`);
  return payload.configValid ? 0 : 1;
}

function cleanCmd(rest: string[], jsonMode: boolean): number {
  if (!rest.includes("--artifacts")) { process.stdout.write("No files deleted. Use --artifacts to prune local LeanAgent artifacts.\n"); return 0; }
  const result = new FileArtifactStore().prune({ maxArtifacts: 0 });
  new JsonCommandCache().clear();
  process.stdout.write(jsonMode ? `${JSON.stringify(result)}\n` : `removed ${result.removed} artifacts (${result.bytes} bytes)\n`);
  return 0;
}

function tokenize(input: string): string[] {
  const out: string[] = [];
  const pattern = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^']*)'|([^\s]+)/g;
  for (const match of input.matchAll(pattern)) out.push(match[1] ?? match[2] ?? match[3]);
  return out;
}

main().then((code) => process.exit(code), (error) => { process.stderr.write(`${String(error)}\n`); process.exit(1); });
