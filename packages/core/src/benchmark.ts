import { performance } from "node:perf_hooks";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseLeanYaml } from "./config.js";
import { createTidyRun } from "./engine.js";
import { FileArtifactStore, JsonCommandCache } from "./store.js";
import { resolveExecutable } from "./util.js";
import type { SessionStats } from "./types.js";

export interface BenchmarkCase {
  name: string;
  repository: string;
  startingCommit?: string;
  task?: string;
  agent?: string;
  model?: string;
  baselineCommand: string[];
  tidyrunCommand?: string[];
  verification?: string[];
  timeoutMs?: number;
  repetitions?: number;
}

export interface BenchmarkRun {
  command: string[];
  exit: number;
  durationMs: number;
  outputBytes: number;
  rawOutputBytes?: number;
  deliveredOutputBytes?: number;
  avoidedOutputBytes?: number;
  cacheHits?: number;
  cacheMisses?: number;
  repetitions?: number;
  endToEndMs?: number;
}

export interface BenchmarkReport {
  schema: "tidyrun.benchmark/v1";
  name: string;
  repository: string;
  task?: string;
  agent?: string;
  model?: string;
  baseline: BenchmarkRun;
  tidyrun: BenchmarkRun;
  tidyrunStats?: SessionStats;
  quality: { baselineVerification?: BenchmarkRun; tidyrunVerification?: BenchmarkRun; equalExit: boolean };
  notes: string[];
}

export function loadBenchmark(path: string): BenchmarkCase {
  const raw = readFileSync(path, "utf8");
  try { return JSON.parse(raw) as BenchmarkCase; }
  catch {
    const parsed = parseLeanYaml(raw) as unknown as Record<string, unknown>;
    return { name: String(parsed.name ?? path), repository: String(parsed.repository ?? process.cwd()), startingCommit: parsed.startingCommit ? String(parsed.startingCommit) : undefined, task: parsed.task ? String(parsed.task) : undefined, agent: parsed.agent ? String(parsed.agent) : undefined, model: parsed.model ? String(parsed.model) : undefined, baselineCommand: Array.isArray(parsed.baselineCommand) ? parsed.baselineCommand.map(String) : ["node", "--version"], tidyrunCommand: Array.isArray(parsed.tidyrunCommand) ? parsed.tidyrunCommand.map(String) : undefined, verification: Array.isArray(parsed.verification) ? parsed.verification.map(String) : undefined, repetitions: parsed.repetitions ? Number(parsed.repetitions) : undefined };
  }
}

export async function runBenchmark(spec: BenchmarkCase): Promise<BenchmarkReport> {
  if (spec.startingCommit) {
    const actual = currentCommit(spec.repository);
    if (actual && actual !== spec.startingCommit) throw new Error(`benchmark startingCommit mismatch: expected ${spec.startingCommit}, found ${actual}`);
  }
  const repetitions = Math.max(1, Math.floor(spec.repetitions ?? 1));
  const baselineRuns: BenchmarkRun[] = [];
  for (let i = 0; i < repetitions; i += 1) baselineRuns.push(await runCommand(spec.baselineCommand, spec.repository, spec.timeoutMs));
  const baseline = { ...aggregateRuns(spec.baselineCommand, baselineRuns, false), endToEndMs: baselineRuns.reduce((sum, run) => sum + run.durationMs, 0) };
  // Never let a previous developer session or another benchmark contaminate a
  // measurement. The temporary store also makes the report safe to reproduce.
  const leanStarted = performance.now();
  const stateRoot = mkdtempSync(join(tmpdir(), "tidyrun-benchmark-"));
  const store = new FileArtifactStore(join(stateRoot, "artifacts"));
  const lean = await createTidyRun({ repository: spec.repository, store, commandCache: new JsonCommandCache(join(stateRoot, "cache")) });
  const leanCommand = spec.tidyrunCommand ?? spec.baselineCommand;
  const identity = JSON.stringify(leanCommand);
  const leanRuns: BenchmarkRun[] = [];
  for (let i = 0; i < repetitions; i += 1) {
    const prepared = await lean.prepareCommand(leanCommand.join(" "), { identity });
    const hit = prepared.find((row) => row.kind === "reuse");
    if (hit) {
      const artifact = hit.artifactId ? store.get(hit.artifactId) : undefined;
      const delivered = Buffer.byteLength(hit.message ?? "");
      leanRuns.push({ command: leanCommand, exit: artifact?.exit ?? 0, durationMs: 0, outputBytes: delivered, rawOutputBytes: artifact?.fullBytes ?? 0, deliveredOutputBytes: delivered, cacheHits: 1, cacheMisses: 0, repetitions: 1 });
      continue;
    }
    let delivered = 0;
    const run = await runCommand(leanCommand, spec.repository, spec.timeoutMs, (result) => {
      const completed = lean.completeCommand(leanCommand.join(" "), result.exit, result.output, result.durationMs, { identity });
      delivered = Buffer.byteLength(completed.delivered);
    });
    leanRuns.push({ ...run, rawOutputBytes: run.outputBytes, deliveredOutputBytes: delivered || run.outputBytes, cacheHits: 0, cacheMisses: 1, repetitions: 1 });
  }
  const tidyrun = { ...aggregateRuns(leanCommand, leanRuns, true), endToEndMs: performance.now() - leanStarted };
  const tidyrunStats = { ...lean.session.stats };
  lean.finish();
  const baselineVerification = spec.verification ? await runCommand(spec.verification, spec.repository, spec.timeoutMs) : undefined;
  const tidyrunVerification = spec.verification ? await runCommand(spec.verification, spec.repository, spec.timeoutMs) : undefined;
  const avoided = Math.max(0, (tidyrun.rawOutputBytes ?? tidyrun.outputBytes) - (tidyrun.deliveredOutputBytes ?? tidyrun.outputBytes));
  return { schema: "tidyrun.benchmark/v1", name: spec.name, repository: spec.repository, task: spec.task, agent: spec.agent, model: spec.model, baseline, tidyrun: { ...tidyrun, avoidedOutputBytes: avoided }, tidyrunStats, quality: { baselineVerification, tidyrunVerification, equalExit: baseline.exit === tidyrun.exit && (!baselineVerification || baselineVerification.exit === tidyrunVerification?.exit) }, notes: ["Output bytes are observed. Avoided bytes are derived from raw command output minus the exact representation delivered by TidyRun. Provider token usage is not inferred.", spec.startingCommit ? `Starting commit verified: ${spec.startingCommit}` : "No startingCommit supplied; use a pinned commit for agent studies."] };
}

function currentCommit(repository: string): string | undefined {
  try { return execFileSync("git", ["-C", repository, "rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || undefined; }
  catch { return undefined; }
}

function aggregateRuns(command: string[], runs: BenchmarkRun[], lean: boolean): BenchmarkRun {
  const raw = runs.reduce((sum, run) => sum + (run.rawOutputBytes ?? run.outputBytes), 0);
  const delivered = runs.reduce((sum, run) => sum + (run.deliveredOutputBytes ?? run.outputBytes), 0);
  return {
    command,
    exit: runs[runs.length - 1]?.exit ?? 1,
    durationMs: runs.reduce((sum, run) => sum + run.durationMs, 0),
    outputBytes: lean ? delivered : raw,
    rawOutputBytes: raw,
    deliveredOutputBytes: delivered,
    avoidedOutputBytes: Math.max(0, raw - delivered),
    cacheHits: runs.reduce((sum, run) => sum + (run.cacheHits ?? 0), 0),
    cacheMisses: runs.reduce((sum, run) => sum + (run.cacheMisses ?? (lean ? 0 : 1)), 0),
    repetitions: runs.length,
  };
}

export function benchmarkMarkdown(report: BenchmarkReport): string {
  const baselineBytes = report.baseline.outputBytes;
  const delivered = report.tidyrun.deliveredOutputBytes ?? report.tidyrun.outputBytes;
  const reduction = baselineBytes ? Math.round((1 - delivered / baselineBytes) * 100) : 0;
  const stats = report.tidyrunStats;
  return `# TidyRun benchmark: ${report.name}\n\nTask: ${report.task ?? "not specified"}\nAgent: ${report.agent ?? "not specified"}\nModel: ${report.model ?? "not specified"}\n\n| Run | Exit | Command time | End-to-end | Raw bytes | Agent-visible bytes | Cache hits |\n|---|---:|---:|---:|---:|---:|---:|\n| Baseline | ${report.baseline.exit} | ${Math.round(report.baseline.durationMs)} ms | ${Math.round(report.baseline.endToEndMs ?? report.baseline.durationMs)} ms | ${report.baseline.outputBytes} | ${report.baseline.outputBytes} | 0 |\n| TidyRun | ${report.tidyrun.exit} | ${Math.round(report.tidyrun.durationMs)} ms | ${Math.round(report.tidyrun.endToEndMs ?? report.tidyrun.durationMs)} ms | ${report.tidyrun.rawOutputBytes ?? report.tidyrun.outputBytes} | ${delivered} | ${report.tidyrun.cacheHits ?? 0} |\n\nObserved agent-visible output reduction: **${reduction}%**\n\nTidyRun overhead (observed): ${Math.round(stats?.overheadMs ?? 0)} ms; snapshot ${Math.round(stats?.repositorySnapshotMs ?? 0)} ms; compression ${Math.round(stats?.compressionMs ?? 0)} ms; artifacts ${Math.round(stats?.artifactMs ?? 0)} ms.\n\nQuality parity: **${report.quality.equalExit ? "PASS" : "REVIEW"}**\n\n${report.notes.join("\n")}`;
}

async function runCommand(command: string[], cwd: string, timeoutMs = 120_000, onComplete?: (result: BenchmarkRun & { output: string }) => Promise<void> | void): Promise<BenchmarkRun> {
  const started = performance.now();
  const result = await new Promise<{ exit: number; output: string }>((resolve) => {
    const executable = resolveExecutable(command[0]);
    const child = spawn(executable.file, [...executable.prefix, ...command.slice(1)], { cwd, shell: false, windowsHide: true });
    let output = "";
    let settled = false;
    const finish = (value: { exit: number; output: string }) => { if (settled) return; settled = true; clearTimeout(timer); resolve(value); };
    const timer = setTimeout(() => { child.kill(); finish({ exit: 124, output: `${output}\nTidyRun benchmark timeout` }); }, timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => { output += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { output += chunk.toString(); });
    child.on("error", (error) => finish({ exit: 1, output: String(error) }));
    child.on("close", (exit) => finish({ exit: exit ?? 1, output }));
  });
  const run = { command, exit: result.exit, durationMs: performance.now() - started, outputBytes: Buffer.byteLength(result.output) };
  await onComplete?.({ ...run, output: result.output });
  return run;
}
