export type LeanEventType =
  | "session.started"
  | "session.finished"
  | "task.started"
  | "task.finished"
  | "model.request"
  | "model.response"
  | "file.read.requested"
  | "file.read.completed"
  | "file.write.requested"
  | "file.write.completed"
  | "search.requested"
  | "search.completed"
  | "command.requested"
  | "command.completed"
  | "test.requested"
  | "test.completed"
  | "build.requested"
  | "build.completed"
  | "tool.requested"
  | "tool.completed"
  | "cache.hit"
  | "cache.miss"
  | "cache.invalidated"
  | "optimization.applied"
  | "optimization.bypassed"
  | "rule.error"
  | "session.metric"
  | "loop.detected";

export type CommandClass = "PURE" | "READ_ONLY" | "LIKELY_SAFE" | "STATEFUL" | "DESTRUCTIVE" | "UNKNOWN";
export type DecisionKind = "allow" | "block" | "compress" | "reuse" | "redirect" | "warn";
export type MetricBasis = "observed" | "derived" | "estimated";

export interface LeanEvent {
  type: LeanEventType;
  ts: number;
  sessionId: string;
  cwd: string;
  payload: Record<string, unknown>;
}

export interface LeanEventBus {
  emit(event: LeanEvent): void;
  on(type: LeanEventType | "*", listener: (event: LeanEvent) => void): () => void;
}

export interface LeanDecision {
  ruleId: string;
  kind: DecisionKind;
  reason: string;
  evidence: string[];
  fallback: string;
  estimatedSavings?: { bytes?: number; basis: MetricBasis };
  confidence: number;
  message?: string;
  artifactId?: string;
}

export interface RuleContext {
  session: SessionState;
  config: LeanConfig;
  store: ArtifactStore;
  repository?: RepositoryState;
}

export interface LeanRule {
  id: string;
  description: string;
  events: LeanEventType[];
  evaluate(event: LeanEvent, context: RuleContext): Promise<LeanDecision | null>;
}

export interface SessionState {
  id: string;
  startedAt: number;
  cwd: string;
  fileReads: Map<string, FileReadRecord>;
  commandFingerprints: Map<string, CommandRecord>;
  eventLog: LeanEvent[];
  mutations: number;
  failedApproaches: FailedApproach[];
  stats: SessionStats;
  bypass: boolean;
  repositoryState?: RepositoryState;
}

export interface FileReadRecord {
  path: string;
  hash: string;
  bytes: number;
  ranges: string[];
  at: number;
}

export interface RepositoryState {
  root: string;
  gitHead?: string;
  gitIndexHash?: string;
  gitMetadata?: string;
  dirtyFiles: string[];
  fileHashes: Record<string, string>;
  /** File metadata used to avoid re-reading unchanged bytes between decisions. */
  fileMetadata?: Record<string, string>;
  fingerprint: string;
  capturedAt: number;
}

export interface CommandRecord {
  fingerprint: string;
  command: string;
  class: CommandClass;
  exit: number;
  artifactId: string;
  stdoutHash: string;
  at: number;
  repositoryFingerprint?: string;
  environmentFingerprint?: string;
  durationMs?: number;
}

export interface CommandCacheEntry extends CommandRecord {
  dependencies: Record<string, string>;
  toolVersion: string;
  valid: boolean;
}

export interface FailedApproach {
  operation: string;
  outcome: string;
  at: number;
  /** Repository state at the time of failure; retries after a mutation are new evidence. */
  repositoryFingerprint?: string;
}

export interface SessionStats {
  fileReads: number;
  duplicateReadsReused: number;
  commands: number;
  cachedCommands: number;
  repeatedBlocked: number;
  loopsDetected: number;
  loopCycles: number;
  rawBytes: number;
  deliveredBytes: number;
  cacheHits: number;
  cacheMisses: number;
  cacheInvalidations: number;
  commandWallMs: number;
  avoidedCommandMs: number;
  modelCalls: number;
  modelInputTokens: number;
  modelOutputTokens: number;
  extraLlmCalls: 0;
  /** Local optimizer cost, measured with a monotonic clock (milliseconds). */
  overheadMs: number;
  ruleEvaluationMs: number;
  repositorySnapshotMs: number;
  compressionMs: number;
  artifactMs: number;
}

export interface LeanConfig {
  version: 1;
  preset: "safe" | "balanced" | "aggressive";
  context: {
    duplicate_reads: "reuse" | "off";
    max_file_bytes: number;
    max_tool_output_chars: number;
  };
  ignore: string[];
  commands: {
    repeated_execution: "reuse" | "off";
    max_identical_failures: number;
  };
  loops: { enabled: boolean; minimum_cycles: number };
  testing: { incremental: boolean; final_verification: boolean };
  cache: { enabled: boolean; conservative: boolean };
  /** Cost controls for avoiding work that cannot repay its own overhead. */
  performance: {
    fast_path: boolean;
    min_output_bytes: number;
    min_command_duration_ms: number;
    min_cache_duration_ms: number;
  };
  metrics: { enabled: boolean };
  telemetry: false;
  disabledRules: string[];
  storage: { max_artifact_bytes: number; max_artifacts: number; retention_days: number };
  security: { allow_outside_repository: boolean; follow_symlinks: boolean; redact_secrets: boolean };
}

export interface ArtifactRecord {
  id: string;
  kind: string;
  sha256: string;
  command?: string;
  cwd: string;
  ts: number;
  exit?: number;
  compressed: string;
  fullPath: string;
  compressedBytes?: number;
  fullBytes?: number;
  fingerprint?: string;
  repositoryFingerprint?: string;
  environmentFingerprint?: string;
  redacted?: boolean;
}

export interface ArtifactStore {
  put(input: {
    kind: string;
    cwd: string;
    command?: string;
    exit?: number;
    full: string;
    compressed: string;
    fingerprint?: string;
    repositoryFingerprint?: string;
    environmentFingerprint?: string;
  }): ArtifactRecord;
  get(id: string): ArtifactRecord | undefined;
  readFull(id: string): string | undefined;
  search(id: string, term: string): string[];
  list(): ArtifactRecord[];
  prune?(options?: { maxBytes?: number; maxArtifacts?: number; olderThanMs?: number }): { removed: number; bytes: number };
}

export interface CommandCache {
  get(fingerprint: string): CommandCacheEntry | undefined;
  put(entry: CommandCacheEntry): void;
  list(): CommandCacheEntry[];
  invalidate(fingerprint: string, reason: string): void;
  clear(): void;
}

export interface AgentCapabilities {
  observeFileReads: boolean;
  interceptFileReads: boolean;
  observeCommands: boolean;
  interceptCommands: boolean;
  observeModelUsage: boolean;
  injectContext: boolean;
  structuredFeedback: boolean;
  sessionLifecycle: boolean;
}

export interface AgentAdapter {
  id: string;
  name: string;
  mode: "native" | "hook" | "wrapper" | "rules" | "mcp";
  capabilities: AgentCapabilities;
  detect(repository: string): boolean;
  install?(repository: string): Promise<{ files: string[]; notes: string[] }>;
  describe(): string;
}

export interface OutputFilter {
  id: string;
  matches(command: string): boolean;
  compress(command: string, output: string, maxChars: number): string;
}

export interface LeanPlugin {
  id: string;
  version: string;
  readonly rules?: readonly LeanRule[];
  readonly adapters?: readonly AgentAdapter[];
  readonly filters?: readonly OutputFilter[];
}

export const DEFAULT_CONFIG: LeanConfig = {
  version: 1,
  preset: "balanced",
  context: { duplicate_reads: "reuse", max_file_bytes: 150_000, max_tool_output_chars: 20_000 },
  ignore: ["node_modules/**", "dist/**", "coverage/**", ".next/**", "*.min.js", "*.map"],
  commands: { repeated_execution: "reuse", max_identical_failures: 2 },
  loops: { enabled: true, minimum_cycles: 3 },
  testing: { incremental: true, final_verification: true },
  cache: { enabled: true, conservative: true },
  performance: { fast_path: true, min_output_bytes: 2048, min_command_duration_ms: 25, min_cache_duration_ms: 100 },
  metrics: { enabled: true },
  telemetry: false,
  disabledRules: [],
  storage: { max_artifact_bytes: 25_000_000, max_artifacts: 2_000, retention_days: 30 },
  security: { allow_outside_repository: false, follow_symlinks: false, redact_secrets: true },
};
