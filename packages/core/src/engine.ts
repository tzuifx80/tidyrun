import { EventEmitter } from "node:events";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { relative } from "node:path";
import { builtinRules } from "./rules.js";
import { compressOutput } from "./compress.js";
import { loadConfig } from "./config.js";
import { FileArtifactStore, JsonCommandCache, newSessionId } from "./store.js";
import { cachedOutputMessage, classifyCommand, commandFingerprint, environmentFingerprint, safeRepositoryPath, redactSecrets, sha256 } from "./util.js";
import { snapshotRepository } from "./repo.js";
import { LeanAgentSecurityError } from "./errors.js";
import { EventBus } from "./events.js";
import { PluginRegistry } from "./plugins.js";
import type { ArtifactStore, CommandCache, LeanConfig, LeanDecision, LeanEvent, LeanEventType, LeanRule, SessionState } from "./types.js";

export interface CreateLeanAgentOptions {
  repository: string;
  store?: ArtifactStore;
  commandCache?: CommandCache;
  config?: LeanConfig;
  bypass?: boolean;
  plugins?: import("./types.js").LeanPlugin[];
}

export interface FileReadOptions {
  force?: boolean;
  range?: { start: number; end?: number };
}

export interface CommandResult {
  delivered: string;
  artifactId: string;
  decisions: LeanDecision[];
}

export class LeanAgent extends EventEmitter {
  readonly session: SessionState;
  readonly config: LeanConfig;
  readonly store: ArtifactStore;
  readonly commandCache: CommandCache;
  readonly rules: LeanRule[];
  readonly bus: EventBus;
  readonly plugins: PluginRegistry;
  private finished = false;

  constructor(opts: CreateLeanAgentOptions) {
    super();
    const requestedCwd = safeRepositoryPath(opts.repository, ".", { allowOutside: true, followSymlinks: true });
    const cwd = existsSync(requestedCwd) ? realpathSync(requestedCwd) : requestedCwd;
    this.config = opts.config ?? loadConfig(cwd);
    this.store = opts.store ?? new FileArtifactStore();
    this.commandCache = opts.commandCache ?? new JsonCommandCache();
    this.bus = new EventBus();
    this.plugins = new PluginRegistry();
    for (const plugin of opts.plugins ?? []) this.plugins.register(plugin);
    this.rules = [...builtinRules, ...this.plugins.getRules()].filter((rule) => !this.config.disabledRules.includes(rule.id) && !this.config.disabledRules.includes("*"));
    this.session = {
      id: newSessionId(),
      startedAt: Date.now(),
      cwd,
      fileReads: new Map(),
      commandFingerprints: new Map(),
      eventLog: [],
      mutations: 0,
      failedApproaches: [],
      bypass: Boolean(opts.bypass) || process.env.LEANAGENT_BYPASS === "1",
      // Repository state is captured lazily on the first operation that needs
      // it. Constructing an agent must not scan a repository before a command
      // or file operation has even been requested.
      repositoryState: undefined,
      stats: {
        fileReads: 0, duplicateReadsReused: 0, commands: 0, cachedCommands: 0, repeatedBlocked: 0,
        loopsDetected: 0, loopCycles: 0, rawBytes: 0, deliveredBytes: 0, cacheHits: 0, cacheMisses: 0,
        cacheInvalidations: 0, commandWallMs: 0, avoidedCommandMs: 0, modelCalls: 0, modelInputTokens: 0, modelOutputTokens: 0, extraLlmCalls: 0,
        overheadMs: 0, ruleEvaluationMs: 0, repositorySnapshotMs: 0, compressionMs: 0, artifactMs: 0,
      },
    };
  }

  emitEvent(type: LeanEventType, payload: Record<string, unknown> = {}): LeanEvent {
    const event: LeanEvent = { type, ts: Date.now(), sessionId: this.session.id, cwd: this.session.cwd, payload };
    this.session.eventLog.push(event);
    this.bus.emit(event);
    try { this.emit("event", event); } catch { /* observers are not part of the operation */ }
    return event;
  }

  async decide(event: LeanEvent): Promise<LeanDecision[]> {
    if (this.session.bypass) {
      const decision: LeanDecision = { ruleId: "bypass", kind: "allow", reason: "LeanAgent bypass enabled", evidence: [], fallback: "original operation", confidence: 1 };
      try { this.emit("optimization", decision); } catch { /* observer failure is isolated */ }
      this.emitEvent("optimization.bypassed", { event: event.type });
      return [decision];
    }
    const out: LeanDecision[] = [];
    for (const rule of this.rules) {
      if (!rule.events.includes(event.type)) continue;
      const ruleStarted = performance.now();
      try {
        const decision = await rule.evaluate(event, { session: this.session, config: this.config, store: this.store, repository: this.session.repositoryState });
        if (!decision) continue;
        out.push(decision);
        try { this.emit("optimization", decision); } catch { /* observer failure is isolated */ }
        this.emitEvent("optimization.applied", { ruleId: decision.ruleId, kind: decision.kind, confidence: decision.confidence });
      } catch (error) {
        // Rule failures must never break the underlying agent operation.
        this.emitEvent("rule.error", { ruleId: rule.id, message: error instanceof Error ? error.message : String(error) });
        try { this.emit("ruleError", { ruleId: rule.id, error }); } catch { /* observer failure is isolated */ }
      } finally {
        const elapsed = performance.now() - ruleStarted;
        this.session.stats.ruleEvaluationMs += elapsed;
        this.session.stats.overheadMs += elapsed;
      }
    }
    return out;
  }

  async readFile(path: string, opts: FileReadOptions = {}): Promise<{ text: string; decisions: LeanDecision[] }> {
    this.session.stats.fileReads += 1;
    let abs: string;
    try {
      abs = safeRepositoryPath(this.session.cwd, path, { allowOutside: this.config.security.allow_outside_repository, followSymlinks: this.config.security.follow_symlinks });
    } catch (error) {
      throw new LeanAgentSecurityError(error instanceof Error ? error.message : "unsafe repository path");
    }
    const rangeKey = opts.range ? `${Math.max(0, opts.range.start)}:${opts.range.end ?? ""}` : "full";
    const requested = this.emitEvent("file.read.requested", { path: abs, force: opts.force === true, range: rangeKey });
    const decisions = await this.decide(requested);
    const redirect = decisions.find((row) => row.kind === "redirect");
    const reuse = decisions.find((row) => row.kind === "reuse");
    if (reuse?.message && !opts.force) {
      this.session.stats.deliveredBytes += Buffer.byteLength(reuse.message);
      return { text: reuse.message, decisions };
    }
    if (redirect && !opts.force && existsSync(abs)) {
      try {
        const full = readFileSync(abs);
        const artifactStarted = performance.now();
        const artifact = this.store.put({ kind: "file-source", cwd: this.session.cwd, full: full.toString("utf8"), compressed: redirect.message ?? "", repositoryFingerprint: this.session.repositoryState?.fingerprint });
        const artifactElapsed = performance.now() - artifactStarted;
        this.session.stats.artifactMs += artifactElapsed;
        this.session.stats.overheadMs += artifactElapsed;
        redirect.artifactId = artifact.id;
        redirect.message = `${redirect.message ?? "LEANAGENT: LARGE FILE"}\n\nFull source: LA://file/${artifact.id}\nFetch with: leanagent cat ${artifact.id} or force=true.`;
        const rangeKey = opts.range ? `${Math.max(0, opts.range.start)}:${opts.range.end ?? ""}` : "full";
        this.session.fileReads.set(abs, { path: abs, hash: sha256(full), bytes: full.length, ranges: [rangeKey], at: Date.now() });
        this.session.stats.rawBytes += full.byteLength;
        this.session.stats.deliveredBytes += Buffer.byteLength(redirect.message);
        return { text: redirect.message, decisions };
      } catch (error) {
        // Optimization is fail-open: a full read is safer than blocking the
        // agent because an artifact directory is temporarily unavailable.
        this.emitEvent("rule.error", { ruleId: "large-file", message: error instanceof Error ? error.message : String(error) });
      }
    }
    let buf: Buffer;
    try { buf = existsSync(abs) ? readFileSync(abs) : Buffer.from(""); } catch { buf = Buffer.from(""); }
    const hash = sha256(buf);
    const start = opts.range ? Math.max(0, Math.min(buf.length, opts.range.start)) : 0;
    const end = opts.range?.end === undefined ? buf.length : Math.max(start, Math.min(buf.length, opts.range.end));
    const text = buf.subarray(start, end).toString("utf8");
    const existing = this.session.fileReads.get(abs);
    const ranges = new Set(existing?.ranges ?? []);
    ranges.add(rangeKey);
    this.session.fileReads.set(abs, { path: abs, hash, bytes: buf.length, ranges: [...ranges], at: Date.now() });
    this.session.stats.rawBytes += buf.length;
    this.session.stats.deliveredBytes += Buffer.byteLength(text);
    this.emitEvent("file.read.completed", { path: abs, bytes: buf.length, range: rangeKey, hash });
    return { text, decisions };
  }

  noteWrite(path: string): void {
    const abs = safeRepositoryPath(this.session.cwd, path, { allowOutside: this.config.security.allow_outside_repository, followSymlinks: this.config.security.follow_symlinks });
    this.session.fileReads.delete(abs);
    this.session.mutations += 1;
    const previousRepoFingerprint = this.session.repositoryState?.fingerprint;
    const snapshotStarted = performance.now();
    this.session.repositoryState = snapshotRepository(this.session.cwd, undefined, this.config.ignore, this.session.repositoryState, { fast: true });
    const snapshotElapsed = performance.now() - snapshotStarted;
    this.session.stats.repositorySnapshotMs += snapshotElapsed;
    this.session.stats.overheadMs += snapshotElapsed;
    const rel = relative(this.session.cwd, abs).replaceAll("\\", "/");
    try {
      for (const entry of this.commandCache.list()) {
        if (entry.repositoryFingerprint === previousRepoFingerprint && Object.prototype.hasOwnProperty.call(entry.dependencies, rel)) {
          this.commandCache.invalidate(entry.fingerprint, `file changed: ${rel}`);
          this.session.stats.cacheInvalidations += 1;
          this.emitEvent("cache.invalidated", { fingerprint: entry.fingerprint, path: rel });
        }
      }
    } catch (error) { this.emitEvent("rule.error", { ruleId: "command-cache", message: error instanceof Error ? error.message : String(error) }); }
    this.emitEvent("file.write.completed", { path: abs, repositoryFingerprint: this.session.repositoryState.fingerprint });
  }

  /** Record provider usage only when an adapter supplies real usage metadata. */
  recordModelUsage(usage: { inputTokens?: number; outputTokens?: number; provider?: string; model?: string }): void {
    const inputTokens = finiteTokens(usage.inputTokens);
    const outputTokens = finiteTokens(usage.outputTokens);
    this.session.stats.modelCalls += 1;
    this.session.stats.modelInputTokens += inputTokens;
    this.session.stats.modelOutputTokens += outputTokens;
    this.emitEvent("model.request", { provider: usage.provider, model: usage.model, inputTokens });
    this.emitEvent("model.response", { provider: usage.provider, model: usage.model, outputTokens });
  }

  async prepareCommand(command: string, options: { identity?: string } = {}): Promise<LeanDecision[]> {
    this.session.stats.commands += 1;
    const cls = classifyCommand(command);
    // Unknown and pure commands cannot safely reuse repository-dependent work,
    // so skip the repository scan entirely. This is the common path for a
    // one-off script whose useful optimization is output compression only.
    const needsRepositoryState = cls !== "UNKNOWN" && (cls !== "PURE" || !this.config.performance.fast_path);
    if (needsRepositoryState) {
      const snapshotStarted = performance.now();
      this.session.repositoryState = snapshotRepository(this.session.cwd, undefined, this.config.ignore, this.session.repositoryState, { fast: true });
      const snapshotElapsed = performance.now() - snapshotStarted;
      this.session.stats.repositorySnapshotMs += snapshotElapsed;
      this.session.stats.overheadMs += snapshotElapsed;
    }
    const repoFp = needsRepositoryState ? this.session.repositoryState?.fingerprint : undefined;
    const envFp = environmentFingerprint();
    const fp = commandFingerprint(options.identity ?? command, this.session.cwd, `${repoFp}:${envFp}:config=${sha256(JSON.stringify(this.config))}:engine=1`);
    const event = this.emitEvent("command.requested", { command, fingerprint: fp, class: cls, repositoryFingerprint: repoFp, environmentFingerprint: envFp });
    const cacheStarted = performance.now();
    let persistent: import("./types.js").CommandCacheEntry | undefined;
    try { persistent = this.config.cache.enabled && cls !== "DESTRUCTIVE" && cls !== "STATEFUL" && cls !== "UNKNOWN" ? this.commandCache.get(fp) : undefined; }
    catch (error) { this.emitEvent("rule.error", { ruleId: "command-cache", message: error instanceof Error ? error.message : String(error) }); }
    const cacheElapsed = performance.now() - cacheStarted;
    this.session.stats.overheadMs += cacheElapsed;
    let cachedArtifact: ReturnType<ArtifactStore["get"]> | undefined;
    try { cachedArtifact = persistent ? this.store.get(persistent.artifactId) : undefined; }
    catch (error) { this.emitEvent("rule.error", { ruleId: "artifact-store", message: error instanceof Error ? error.message : String(error) }); }
    if (persistent && persistent.exit === 0 && persistent.class === cls && persistent.repositoryFingerprint === repoFp && persistent.environmentFingerprint === envFp && cachedArtifact?.fingerprint === fp) {
      const decision: LeanDecision = {
        ruleId: "persistent-command-cache", kind: "reuse", reason: "Safe command result verified for the same repository and environment state.",
        evidence: [`repository=${(repoFp ?? "none").slice(0, 12)}`, `environment=${envFp.slice(0, 12)}`, `exit=${persistent.exit}`], fallback: `leanagent cat ${persistent.artifactId}`,
        confidence: 0.9, artifactId: persistent.artifactId, estimatedSavings: { bytes: cachedArtifact.compressedBytes, basis: "derived" },
        message: cachedOutputMessage(command, cachedArtifact),
      };
      this.session.stats.cachedCommands += 1;
      this.session.stats.cacheHits += 1;
      this.session.stats.avoidedCommandMs += persistent.durationMs ?? 0;
      this.session.stats.rawBytes += cachedArtifact.fullBytes ?? 0;
      this.session.stats.deliveredBytes += Buffer.byteLength(decision.message ?? "");
      this.emitEvent("cache.hit", { fingerprint: fp, artifactId: persistent.artifactId });
      const additional = (await this.decide(event)).filter((item) => item.ruleId !== "repeated-command");
      return [decision, ...additional].filter((item, index, all) => all.findIndex((candidate) => candidate.ruleId === item.ruleId) === index);
    }
    this.session.stats.cacheMisses += 1;
    this.emitEvent("cache.miss", { fingerprint: fp });
    return this.decide(event);
  }

  completeCommand(command: string, exit: number, output: string, durationMs?: number, options: { identity?: string } = {}): CommandResult {
    const started = performance.now();
    const cls = classifyCommand(command);
    const safeOutput = this.config.security.redact_secrets ? redactSecrets(output) : output;
    const elapsed = durationMs ?? performance.now() - started;
    const outputBytes = Buffer.byteLength(safeOutput);
    const cheapSuccess = this.config.performance.fast_path && durationMs !== undefined && cls === "PURE" && exit === 0 && outputBytes < this.config.performance.min_output_bytes && elapsed < this.config.performance.min_command_duration_ms;
    if (cheapSuccess) {
      // A tiny pure command cannot repay a repository/artifact/cache roundtrip.
      // Keep the exact output and fail open; callers still get normal exit
      // semantics while the session records a useful command event.
      this.session.stats.rawBytes += outputBytes;
      this.session.stats.deliveredBytes += outputBytes;
      this.session.stats.commandWallMs += elapsed;
      this.emitEvent("optimization.bypassed", { reason: "adaptive-fast-path", command, outputBytes, durationMs: elapsed });
      this.emitEvent("command.completed", { command, exit, artifactId: "", durationMs: elapsed });
      return { delivered: safeOutput, artifactId: "", decisions: [] };
    }
    const compressionStarted = performance.now();
    let compressed: string;
    try {
      const pluginFilter = this.plugins.getFilters().find((filter) => filter.matches(command));
      compressed = pluginFilter ? pluginFilter.compress(command, safeOutput, this.config.context.max_tool_output_chars) : compressOutput(command, safeOutput, this.config.context.max_tool_output_chars);
      if (typeof compressed !== "string") throw new Error("output filter returned a non-string result");
    } catch (error) {
      this.emitEvent("rule.error", { ruleId: "output-compression", message: error instanceof Error ? error.message : String(error) });
      compressed = safeOutput;
    }
    const compressionElapsed = performance.now() - compressionStarted;
    this.session.stats.compressionMs += compressionElapsed;
    this.session.stats.overheadMs += compressionElapsed;
    const repoFp = this.session.repositoryState?.fingerprint;
    const envFp = environmentFingerprint();
    const fp = commandFingerprint(options.identity ?? command, this.session.cwd, `${repoFp ?? ""}:${envFp}:config=${sha256(JSON.stringify(this.config))}:engine=1`);
    const artifactStarted = performance.now();
    let artifact: ReturnType<ArtifactStore["put"]> | undefined;
    const persistArtifact = exit !== 0 || outputBytes >= this.config.performance.min_output_bytes || durationMs === undefined || elapsed >= this.config.performance.min_cache_duration_ms;
    if (persistArtifact) {
      try {
        artifact = this.store.put({ kind: "command-result", cwd: this.session.cwd, command, exit, full: safeOutput, compressed, fingerprint: fp, repositoryFingerprint: repoFp, environmentFingerprint: envFp });
      } catch (error) {
        this.emitEvent("rule.error", { ruleId: "artifact-store", message: error instanceof Error ? error.message : String(error) });
      }
    }
    const artifactElapsed = performance.now() - artifactStarted;
    this.session.stats.artifactMs += artifactElapsed;
    this.session.stats.overheadMs += artifactElapsed;
    const artifactId = artifact?.id ?? "";
    this.session.commandFingerprints.set(fp, { fingerprint: fp, command, class: cls, exit, artifactId, stdoutHash: sha256(safeOutput), at: Date.now(), repositoryFingerprint: repoFp, environmentFingerprint: envFp, durationMs: elapsed });
    // Only successful, explicitly safe operations become reusable cache entries.
    // Failures remain available as artifacts and are handled by failed-approach
    // memory, so an agent can rerun after making a hypothesis-changing edit.
    if (artifact && exit === 0 && this.config.cache.enabled && cls !== "DESTRUCTIVE" && cls !== "STATEFUL" && cls !== "UNKNOWN") {
      try { this.commandCache.put({ fingerprint: fp, command, class: cls, exit, artifactId: artifact.id, stdoutHash: sha256(safeOutput), at: Date.now(), repositoryFingerprint: repoFp, environmentFingerprint: envFp, durationMs: elapsed, dependencies: this.session.repositoryState?.fileHashes ?? {}, toolVersion: "leanagent/0.1", valid: true }); } catch { /* optimization is best effort */ }
    }
    if (exit !== 0) this.session.failedApproaches.push({ operation: command, outcome: `exit ${exit}`, at: Date.now(), repositoryFingerprint: repoFp });
    this.session.stats.rawBytes += Buffer.byteLength(safeOutput);
    const delivered = compressed === safeOutput || !artifact ? compressed : `${compressed}\n\nFull output:\nLA://command/${artifact.id}\n`;
    this.session.stats.deliveredBytes += Buffer.byteLength(delivered);
    this.session.stats.commandWallMs += elapsed;
    const completed = this.emitEvent("command.completed", { command, exit, artifactId, durationMs: elapsed });
    void this.decide(completed);
    try { if (this.store.prune) this.store.prune({ maxBytes: this.config.storage.max_artifact_bytes, maxArtifacts: this.config.storage.max_artifacts, olderThanMs: this.config.storage.retention_days * 86_400_000 }); } catch { /* best effort */ }
    return { delivered, artifactId, decisions: [] };
  }

  finish(): void {
    if (this.finished) return;
    this.finished = true;
    this.emitEvent("session.finished", { stats: this.session.stats, durationMs: Date.now() - this.session.startedAt });
    if (this.config.metrics.enabled) {
      try { this.store.put({ kind: "session-metrics", cwd: this.session.cwd, full: JSON.stringify({ sessionId: this.session.id, startedAt: this.session.startedAt, finishedAt: Date.now(), stats: this.session.stats, repository: this.session.repositoryState }, null, 2), compressed: this.statsText() }); } catch { /* metrics must not break shutdown */ }
      try { this.store.put({ kind: "session-events", cwd: this.session.cwd, full: JSON.stringify(this.session.eventLog), compressed: `${this.session.eventLog.length} normalized events` }); } catch { /* metrics must not break shutdown */ }
    }
  }

  statsText(): string {
    const s = this.session.stats;
    const avoided = Math.max(0, s.rawBytes - s.deliveredBytes);
    const tokenEstimate = Math.ceil(avoided / 4);
    return [
      "LeanAgent", "────────────────────────────────────", `Session: ${this.session.id}`, "",
      "CONTEXT  [observed bytes]", `Raw tool/file bytes            ${s.rawBytes}`, `Returned to agent              ${s.deliveredBytes}`, `Avoided                        ${avoided}`,
      `Estimated context tokens       ${tokenEstimate} [estimated: bytes/4]`, "", "OPERATIONS  [observed]",
      `File reads                     ${s.fileReads}`, `Duplicate reads reused         ${s.duplicateReadsReused}`, `Commands                       ${s.commands}`,
      `Cached commands                ${s.cachedCommands}`, `Cache misses                   ${s.cacheMisses}`, `Repeated commands warned       ${s.repeatedBlocked}`,
      `Loops detected                 ${s.loopsDetected}`, `Command wall time (ms)         ${Math.round(s.commandWallMs)}`, "", "LEANAGENT OVERHEAD  [observed]", `Total overhead (ms)            ${Math.round(s.overheadMs)}`, `Snapshot (ms)                  ${Math.round(s.repositorySnapshotMs)}`, `Compression (ms)               ${Math.round(s.compressionMs)}`, `Artifacts (ms)                 ${Math.round(s.artifactMs)}`, "", `MODEL USAGE  [provider metadata]`, `Model calls                   ${s.modelCalls}`, `Input tokens                 ${s.modelInputTokens}`, `Output tokens                ${s.modelOutputTokens}`, "", "ADDITIONAL LLM CALLS           0  [observed]",
    ].join("\n");
  }
}

function finiteTokens(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export async function createLeanAgent(opts: CreateLeanAgentOptions): Promise<LeanAgent> {
  const agent = new LeanAgent(opts);
  agent.emitEvent("session.started", { cwd: opts.repository, repositoryFingerprint: agent.session.repositoryState?.fingerprint });
  return agent;
}
