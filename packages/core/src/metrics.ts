import type { ArtifactStore, SessionStats } from "./types.js";

export interface MetricValue { value: number; basis: "observed" | "derived" | "estimated" }

export function estimateTokens(bytes: number): MetricValue {
  return { value: Math.ceil(Math.max(0, bytes) / 4), basis: "estimated" };
}

export function latestSessionStats(store: ArtifactStore): { id: string; stats?: SessionStats; raw: string } | undefined {
  const row = store.list().find((item) => item.kind === "session-metrics");
  if (!row) return undefined;
  const raw = store.readFull(row.id) ?? "";
  try { return { id: row.id, stats: (JSON.parse(raw) as { stats?: SessionStats }).stats, raw }; } catch { return { id: row.id, raw }; }
}

export function statsSummary(stats: SessionStats): Record<string, MetricValue> {
  return {
    rawBytes: { value: stats.rawBytes, basis: "observed" },
    deliveredBytes: { value: stats.deliveredBytes, basis: "observed" },
    avoidedBytes: { value: Math.max(0, stats.rawBytes - stats.deliveredBytes), basis: "derived" },
    estimatedTokensAvoided: estimateTokens(Math.max(0, stats.rawBytes - stats.deliveredBytes)),
    cacheHits: { value: stats.cacheHits, basis: "observed" },
    duplicateReadsReused: { value: stats.duplicateReadsReused, basis: "observed" },
    loopsDetected: { value: stats.loopsDetected, basis: "observed" },
    overheadMs: { value: stats.overheadMs ?? 0, basis: "observed" },
    repositorySnapshotMs: { value: stats.repositorySnapshotMs ?? 0, basis: "observed" },
    compressionMs: { value: stats.compressionMs ?? 0, basis: "observed" },
    artifactMs: { value: stats.artifactMs ?? 0, basis: "observed" },
    modelCalls: { value: stats.modelCalls, basis: "observed" },
    modelInputTokens: { value: stats.modelInputTokens, basis: "observed" },
    modelOutputTokens: { value: stats.modelOutputTokens, basis: "observed" },
  };
}
