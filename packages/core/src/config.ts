import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { parse as parseYaml } from "./yaml.js";
import { DEFAULT_CONFIG, type LeanConfig } from "./types.js";

export function homeDir(override?: string): string {
  return override || process.env.TIDYRUN_HOME || join(homedir(), ".tidyrun");
}

export function loadConfig(repoRoot: string, home = homeDir()): LeanConfig {
  const merged: LeanConfig = structuredClone(DEFAULT_CONFIG);
  const files = [join(home, "config", "tidyrun.yaml"), join(repoRoot, "tidyrun.yaml")];
  for (const file of files) {
    if (!existsSync(file)) continue;
    const raw = readFileSync(file, "utf8");
    Object.assign(merged, parseLeanYaml(raw, merged));
  }
  if (process.env.TIDYRUN_BYPASS === "1") {
    merged.disabledRules = ["*"];
  }
  return merged;
}

export function parseLeanYaml(raw: string, base: LeanConfig = DEFAULT_CONFIG): LeanConfig {
  const doc = parseYaml(raw);
  const out = structuredClone(base);
  if (typeof doc.preset === "string" && ["safe", "balanced", "aggressive"].includes(doc.preset)) {
    out.preset = doc.preset as LeanConfig["preset"];
    applyPresetDefaults(out);
  }
  if (doc.context && typeof doc.context === "object") Object.assign(out.context, doc.context);
  if (Array.isArray(doc.ignore)) out.ignore = doc.ignore.map(String);
  if (doc.commands && typeof doc.commands === "object") Object.assign(out.commands, doc.commands);
  if (doc.loops && typeof doc.loops === "object") Object.assign(out.loops, doc.loops);
  if (doc.testing && typeof doc.testing === "object") Object.assign(out.testing, doc.testing);
  if (doc.cache && typeof doc.cache === "object") Object.assign(out.cache, doc.cache);
  if (doc.performance && typeof doc.performance === "object") Object.assign(out.performance, doc.performance);
  if (doc.metrics && typeof doc.metrics === "object") Object.assign(out.metrics, doc.metrics);
  if (doc.storage && typeof doc.storage === "object") Object.assign(out.storage, doc.storage);
  if (doc.security && typeof doc.security === "object") Object.assign(out.security, doc.security);
  if (Array.isArray(doc.disabledRules)) out.disabledRules = doc.disabledRules.map(String);
  out.telemetry = false;
  out.version = 1;
  if (out.context.duplicate_reads !== "reuse" && out.context.duplicate_reads !== "off") out.context.duplicate_reads = DEFAULT_CONFIG.context.duplicate_reads;
  if (out.commands.repeated_execution !== "reuse" && out.commands.repeated_execution !== "off") out.commands.repeated_execution = DEFAULT_CONFIG.commands.repeated_execution;
  out.loops.enabled = asBoolean(out.loops.enabled, DEFAULT_CONFIG.loops.enabled);
  out.testing.incremental = asBoolean(out.testing.incremental, DEFAULT_CONFIG.testing.incremental);
  out.testing.final_verification = asBoolean(out.testing.final_verification, DEFAULT_CONFIG.testing.final_verification);
  out.cache.enabled = asBoolean(out.cache.enabled, DEFAULT_CONFIG.cache.enabled);
  out.cache.conservative = asBoolean(out.cache.conservative, DEFAULT_CONFIG.cache.conservative);
  out.performance.fast_path = asBoolean(out.performance.fast_path, DEFAULT_CONFIG.performance.fast_path);
  out.metrics.enabled = asBoolean(out.metrics.enabled, DEFAULT_CONFIG.metrics.enabled);
  out.security.allow_outside_repository = asBoolean(out.security.allow_outside_repository, DEFAULT_CONFIG.security.allow_outside_repository);
  out.security.follow_symlinks = asBoolean(out.security.follow_symlinks, DEFAULT_CONFIG.security.follow_symlinks);
  out.security.redact_secrets = asBoolean(out.security.redact_secrets, DEFAULT_CONFIG.security.redact_secrets);
  out.context.max_file_bytes = positiveInt(out.context.max_file_bytes, DEFAULT_CONFIG.context.max_file_bytes);
  out.context.max_tool_output_chars = positiveInt(out.context.max_tool_output_chars, DEFAULT_CONFIG.context.max_tool_output_chars);
  out.commands.max_identical_failures = positiveInt(out.commands.max_identical_failures, DEFAULT_CONFIG.commands.max_identical_failures);
  out.loops.minimum_cycles = Math.max(2, positiveInt(out.loops.minimum_cycles, DEFAULT_CONFIG.loops.minimum_cycles));
  out.storage.max_artifact_bytes = positiveInt(out.storage.max_artifact_bytes, DEFAULT_CONFIG.storage.max_artifact_bytes);
  out.storage.max_artifacts = positiveInt(out.storage.max_artifacts, DEFAULT_CONFIG.storage.max_artifacts);
  out.storage.retention_days = positiveInt(out.storage.retention_days, DEFAULT_CONFIG.storage.retention_days);
  out.performance.min_output_bytes = positiveInt(out.performance.min_output_bytes, DEFAULT_CONFIG.performance.min_output_bytes);
  out.performance.min_command_duration_ms = positiveInt(out.performance.min_command_duration_ms, DEFAULT_CONFIG.performance.min_command_duration_ms);
  out.performance.min_cache_duration_ms = positiveInt(out.performance.min_cache_duration_ms, DEFAULT_CONFIG.performance.min_cache_duration_ms);
  out.disabledRules = [...new Set(out.disabledRules)];
  return out;
}

function applyPresetDefaults(out: LeanConfig): void {
  if (out.preset === "safe") {
    out.context.max_file_bytes = Math.max(out.context.max_file_bytes, 150_000);
    out.context.max_tool_output_chars = Math.max(out.context.max_tool_output_chars, 20_000);
    out.commands.repeated_execution = "off";
    out.loops.minimum_cycles = Math.max(out.loops.minimum_cycles, 4);
    out.security.follow_symlinks = false;
  } else if (out.preset === "aggressive") {
    out.context.max_file_bytes = Math.min(out.context.max_file_bytes, 100_000);
    out.context.max_tool_output_chars = Math.min(out.context.max_tool_output_chars, 12_000);
    out.commands.max_identical_failures = Math.min(out.commands.max_identical_failures, 1);
    out.loops.minimum_cycles = 2;
  }
}

function positiveInt(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function writeDefaultConfig(repoRoot: string): string {
  const path = join(repoRoot, "tidyrun.yaml");
  if (!existsSync(path)) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(
      path,
      `version: 1
preset: balanced
context:
  duplicate_reads: reuse
  max_file_bytes: 150000
  max_tool_output_chars: 20000
ignore:
  - node_modules/**
  - dist/**
  - coverage/**
commands:
  repeated_execution: reuse
  max_identical_failures: 2
loops:
  enabled: true
  minimum_cycles: 3
testing:
  incremental: true
  final_verification: true
cache:
  enabled: true
  conservative: true
performance:
  fast_path: true
  min_output_bytes: 2048
  min_command_duration_ms: 25
  min_cache_duration_ms: 100
storage:
  max_artifact_bytes: 25000000
  max_artifacts: 2000
  retention_days: 30
security:
  allow_outside_repository: false
  follow_symlinks: false
  redact_secrets: true
metrics:
  enabled: true
telemetry: false
`,
      "utf8",
    );
  }
  mkdirSync(homeDir(), { recursive: true, mode: 0o700 });
  mkdirSync(join(homeDir(), "artifacts"), { recursive: true, mode: 0o700 });
  mkdirSync(join(homeDir(), "logs"), { recursive: true, mode: 0o700 });
  mkdirSync(join(homeDir(), "config"), { recursive: true, mode: 0o700 });
  return path;
}

export function disableRule(repoRoot: string, ruleId: string): string {
  const path = join(repoRoot, "tidyrun.yaml");
  const raw = existsSync(path) ? readFileSync(path, "utf8") : "version: 1\npreset: balanced\n";
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const index = lines.findIndex((line) => /^disabledRules:\s*$/.test(line.trim()));
  if (index < 0) {
    lines.push("disabledRules:", `  - ${ruleId}`);
  } else if (!lines.some((line, i) => i > index && /^\s+-\s+/.test(line) && line.includes(ruleId))) {
    let insert = index + 1;
    while (insert < lines.length && /^\s+-\s+/.test(lines[insert])) insert += 1;
    lines.splice(insert, 0, `  - ${ruleId}`);
  }
  writeFileSync(path, lines.join("\n").replace(/\n+$/, "\n"), "utf8");
  return path;
}
