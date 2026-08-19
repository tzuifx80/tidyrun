import { existsSync, readFileSync, statSync } from "node:fs";
import type { LeanDecision, LeanEvent, LeanRule, RuleContext } from "./types.js";
import { cachedOutputMessage, globishMatch, looksBinary, normalizePath, sha256 } from "./util.js";

export const duplicateReadRule: LeanRule = {
  id: "duplicate-read",
  description: "Reuse unchanged file reads in the current session",
  events: ["file.read.requested"],
  async evaluate(event, ctx) {
    if (ctx.config.context.duplicate_reads !== "reuse") return null;
    const rawPath = String(event.payload.path || "");
    const path = normalizePath(event.cwd, rawPath);
    const rec = ctx.session.fileReads.get(path);
    if (!rec) return null;
    if (!existsSync(path)) return null;
    const buf = readFileSync(path);
    const hash = sha256(buf);
    if (hash !== rec.hash) {
      ctx.session.fileReads.delete(path);
      return null;
    }
    const requestedRange = String(event.payload.range || "full");
    if (!rec.ranges.includes(requestedRange)) return null;
    ctx.session.stats.duplicateReadsReused += 1;
    return decision(
      "duplicate-read",
      "reuse",
      "Same path and content hash already read this session.",
      [`path=${path}`, `hash=${hash.slice(0, 12)}`],
      "Use force=true to retrieve full content again.",
      `LEAN: unchanged ${path} (${requestedRange}); force=true for full`,
    );
  },
};

export const largeFileRule: LeanRule = {
  id: "large-file",
  description: "Block huge/generated files from full context",
  events: ["file.read.requested"],
  async evaluate(event, ctx) {
    if (event.payload.force === true) return null;
    const path = normalizePath(event.cwd, String(event.payload.path || ""));
    if (!existsSync(path)) return null;
    const st = statSync(path);
    if (!st.isFile()) return null;
    const ignored = ctx.config.ignore.some((pattern) => globishMatch(path, pattern) || globishMatch(path.replace(/\\/g, "/"), pattern));
    const oversize = st.size > ctx.config.context.max_file_bytes;
    let binary = false;
    if (st.size > 0 && st.size < 8_000_000) {
      binary = looksBinary(readFileSync(path));
    }
    const name = path.replace(/\\/g, "/").toLowerCase();
    const generated =
      /(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|\.min\.js$|\.map$|coverage\/|\.next\/|node_modules\/)/.test(name);
    if (!ignored && !oversize && !binary && !generated) return null;
    const reason = binary ? "binary-like" : generated ? "generated/lockfile" : oversize ? "oversize" : "ignore pattern";
    const summary = summarizeLargeFile(path, st.size);
    return decision(
      "large-file",
      "redirect",
      `Full contents are almost never useful (${reason}).`,
      [`bytes=${st.size}`, `reason=${reason}`],
      "tidyrun cat <handle> or force=true",
      `LEAN: large file ${path} (${st.size} bytes ${reason})\n${summary}\nNot returned in full.`,
    );
  },
};

export const repeatedCommandRule: LeanRule = {
  id: "repeated-command",
  description: "Reuse deterministic command results when inputs are unchanged",
  events: ["command.requested"],
  async evaluate(event, ctx) {
    if (ctx.config.commands.repeated_execution !== "reuse" || !ctx.config.cache.enabled) return null;
    const command = String(event.payload.command || "");
    const fp = String(event.payload.fingerprint || "");
    const rec = ctx.session.commandFingerprints.get(fp);
    if (!rec) return null;
    // A failed command is evidence for the agent, not a reusable success. The
    // failed-approach rule will warn on an unchanged retry while still allowing
    // the underlying command to run and reveal new diagnostics.
    if (rec.exit !== 0) return null;
    if (rec.class === "DESTRUCTIVE" || rec.class === "STATEFUL" || rec.class === "UNKNOWN") return null;
    ctx.session.stats.cachedCommands += 1;
    ctx.session.stats.cacheHits += 1;
    if (!rec.artifactId) return null;
    const artifact = ctx.store.get(rec.artifactId);
    if (!artifact) return null;
    if (artifact) {
      ctx.session.stats.rawBytes += artifact.fullBytes ?? 0;
      ctx.session.stats.deliveredBytes += Buffer.byteLength(cachedOutputMessage(command, artifact));
    }
    return {
      ruleId: "repeated-command",
      kind: "reuse",
      reason: "Same safe command fingerprint with unchanged session inputs.",
      evidence: [`command=${command}`, `class=${rec.class}`, `exit=${rec.exit}`],
      fallback: `tidyrun cat ${rec.artifactId}`,
      confidence: 0.8,
      artifactId: rec.artifactId,
      estimatedSavings: { bytes: artifact?.compressed.length, basis: "derived" },
      message: artifact ? cachedOutputMessage(command, artifact) : undefined,
    } satisfies LeanDecision;
  },
};

export const loopRule: LeanRule = {
  id: "loop-detection",
  description: "Detect no-progress tool cycles",
  events: ["command.completed", "file.read.completed", "search.requested"],
  async evaluate(event, ctx) {
    if (!ctx.config.loops.enabled) return null;
    const seq = recentOps(ctx, 12);
    const cycles = countCycles(seq, ctx.config.loops.minimum_cycles);
    if (!cycles) return null;
    const recentMutations = ctx.session.eventLog.slice(-12).some((item) => item.type === "file.write.completed");
    if (recentMutations) return null;
    ctx.session.stats.loopsDetected += 1;
    ctx.session.stats.loopCycles += cycles.count;
    return decision(
      "loop-detection",
      "warn",
      "Repeated tool sequence with no repository mutation or new evidence.",
      [`pattern=${cycles.pattern}`, `cycles=${cycles.count}`],
      "Change hypothesis or bypass with TIDYRUN_BYPASS=1.",
      `LEAN: loop detected (${cycles.count}x)`,
    );
  },
};

export const failedApproachRule: LeanRule = {
  id: "failed-approach",
  description: "Warn when the same observable failed operation is retried",
  events: ["command.requested"],
  async evaluate(event, ctx) {
    const command = String(event.payload.command || "");
    const repositoryFingerprint = ctx.repository?.fingerprint;
    const attempts = ctx.session.failedApproaches.filter((row) => row.operation === command && (!row.repositoryFingerprint || row.repositoryFingerprint === repositoryFingerprint));
    const hit = attempts[attempts.length - 1];
    if (!hit || attempts.length < ctx.config.commands.max_identical_failures) return null;
    ctx.session.stats.repeatedBlocked += 1;
    return decision(
      "failed-approach",
      "warn",
      "Identical command already failed under unchanged conditions.",
      [`previous=${hit.outcome}`, `identicalFailures=${attempts.length}`],
      "Edit the command or repository first.",
      `LEAN: previous failure ${command} (${hit.outcome})`,
    );
  },
};

function recentOps(ctx: RuleContext, n: number): string[] {
  const relevant = ctx.session.eventLog.filter((event) => ["file.read.requested", "file.read.completed", "command.requested", "command.completed", "search.requested", "test.requested"].includes(event.type)).slice(-n);
  return relevant.map((event) => {
    const target = String(event.payload.path || event.payload.command || event.payload.query || event.type);
    // Include observable evidence so productive repetition (a changed failure,
    // file hash, or artifact) is not mistaken for a no-progress loop.
    const evidence = [event.payload.hash, event.payload.exit, event.payload.artifactId, event.payload.resultHash]
      .filter((item) => item !== undefined)
      .map(String)
      .join(":");
    return `${event.type}:${target}${evidence ? `:${evidence}` : ""}`;
  });
}

function countCycles(seq: string[], minimum: number): { pattern: string; count: number } | null {
  if (seq.length < minimum * 2) return null;
  for (let size = 2; size <= 4; size += 1) {
    if (seq.length < size * minimum) continue;
    const pattern = seq.slice(-size).join(" → ");
    let count = 0;
    for (let i = seq.length; i >= size; i -= size) {
      const chunk = seq.slice(i - size, i).join(" → ");
      if (chunk === pattern) count += 1;
      else break;
    }
    if (count >= minimum) return { pattern, count };
  }
  return null;
}

function decision(
  ruleId: string,
  kind: LeanDecision["kind"],
  reason: string,
  evidence: string[],
  fallback: string,
  message: string,
): LeanDecision {
  return { ruleId, kind, reason, evidence, fallback, confidence: 0.85, message };
}

export const builtinRules: LeanRule[] = [
  duplicateReadRule,
  largeFileRule,
  repeatedCommandRule,
  failedApproachRule,
  loopRule,
];

function summarizeLargeFile(path: string, bytes: number): string {
  const lower = path.replaceAll("\\", "/").toLowerCase();
  if (/lock$|lock\.json$|package-lock|pnpm-lock|yarn\.lock/.test(lower)) return "Suggested alternative: query dependency names/versions instead of loading the lockfile.";
  if (/\.log$|logs?\//.test(lower)) return "Suggested alternative: extract ERROR/WARN lines and the surrounding traceback.";
  if (/\.json$/.test(lower)) return `Suggested alternative: inspect top-level keys and query selected sections (${bytes} bytes).`;
  if (/\.map$|\.min\./.test(lower)) return "Suggested alternative: inspect the original source file and source map metadata.";
  return "Suggested alternative: read targeted ranges or a source/configuration file that generated this artifact.";
}
