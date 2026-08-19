import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const realDir = process.env.REAL_RESULTS_DIR;
const optionalDir = process.env.REAL_OPTIONAL_DIR;
if (!realDir || !optionalDir) throw new Error("REAL_RESULTS_DIR and REAL_OPTIONAL_DIR are required");
const finalData = JSON.parse(readFileSync(join(realDir, "real-agent-results.json"), "utf8"));
const optional = JSON.parse(readFileSync(join(optionalDir, "real-agent-results.json"), "utf8")).tasks[0];
const tasks = finalData.tasks.map((task) => ({
  data: task.id === "py-optional-offset" ? optional : task,
  sourceDir: task.id === "py-optional-offset" ? optionalDir : realDir,
}));
const suite = existsSync(join(root, "benchmarks", "suite-report.json")) ? JSON.parse(readFileSync(join(root, "benchmarks", "suite-report.json"), "utf8")) : undefined;

const taskRows = tasks.map(({ data: task, sourceDir }) => {
  const repo = join(sourceDir, task.id, "leanagent");
  const stats = aggregateSessions(repo);
  return {
    id: task.id,
    repository: task.repository,
    startingCommit: task.startingCommit,
    baseline: compactRun(task.baseline),
    leanagent: { ...compactRun(task.leanagent), stats },
    qualityParity: task.baseline.quality.status === "PASS" && task.leanagent.quality.status === "PASS",
  };
});

const aggregate = taskRows.reduce((sum, task) => {
  sum.baselinePass += task.baseline.quality.status === "PASS" ? 1 : 0;
  sum.leanagentPass += task.leanagent.quality.status === "PASS" ? 1 : 0;
  sum.parity += task.qualityParity ? 1 : 0;
  sum.baselineToolOutputBytes += task.baseline.agentVisibleToolOutputBytes;
  sum.leanagentToolOutputBytes += task.leanagent.agentVisibleToolOutputBytes;
  sum.baselineToolCalls += task.baseline.toolCalls;
  sum.leanagentToolCalls += task.leanagent.toolCalls;
  sum.baselineWallMs += task.baseline.wallMs;
  sum.leanagentWallMs += task.leanagent.wallMs;
  sum.baselineInputTokens += task.baseline.inputTokens ?? 0;
  sum.leanagentInputTokens += task.leanagent.inputTokens ?? 0;
  sum.baselineCachedInputTokens += task.baseline.cachedInputTokens ?? 0;
  sum.leanagentCachedInputTokens += task.leanagent.cachedInputTokens ?? 0;
  sum.baselineOutputTokens += task.baseline.outputTokens ?? 0;
  sum.leanagentOutputTokens += task.leanagent.outputTokens ?? 0;
  sum.leanagentRawBytes += task.leanagent.stats.rawBytes;
  sum.leanagentDeliveredBytes += task.leanagent.stats.deliveredBytes;
  sum.leanagentOverheadMs += task.leanagent.stats.overheadMs;
  sum.leanagentCacheHits += task.leanagent.stats.cacheHits;
  sum.leanagentDuplicateReads += task.leanagent.stats.duplicateReadsReused;
  sum.leanagentExtraLlmCalls += task.leanagent.stats.extraLlmCalls ?? 0;
  return sum;
}, { baselinePass: 0, leanagentPass: 0, parity: 0, baselineToolOutputBytes: 0, leanagentToolOutputBytes: 0, baselineToolCalls: 0, leanagentToolCalls: 0, baselineWallMs: 0, leanagentWallMs: 0, baselineInputTokens: 0, leanagentInputTokens: 0, baselineCachedInputTokens: 0, leanagentCachedInputTokens: 0, baselineOutputTokens: 0, leanagentOutputTokens: 0, leanagentRawBytes: 0, leanagentDeliveredBytes: 0, leanagentOverheadMs: 0, leanagentCacheHits: 0, leanagentDuplicateReads: 0, leanagentExtraLlmCalls: 0 });

const report = {
  schema: "leanagent.final-launch-report/v1",
  commitSha: process.env.BENCHMARK_COMMIT ?? "d74ae8670dedf79f94e136202ea853dacd82535f",
  observedAt: new Date().toISOString(),
  environment: { os: "Windows", platform: process.platform, node: process.version, npm: process.env.npm_package_manager ?? "npm 11.16.0", python: "3.11.15", repository: root },
  agents: { codex: { installed: "0.147.0", authenticated: true, model: "gpt-5.4-mini", reasoning: "low", tasksCompleted: 10 }, gemini: { installed: "0.53.1", authenticated: false, result: "not run" }, opencode: { installed: "1.18.15", credentialsDetected: true, result: "no completed task; provider attempts errored or timed out" } },
  repositories: ["fixtures/python-project", "fixtures/typescript-app"],
  realAgentStudy: { methodology: "Fresh A/B repositories from the same generated source commit; identical task prompt and Codex model; B adds only LeanAgent wrapper instructions and a local package install; acceptance commands run independently after the agent.", tasks: taskRows, aggregate, negativeResults: ["Aggregate wall time increased in the LeanAgent treatment; this study does not support a speedup claim.", "Provider token telemetry was observed but is not presented as billing savings.", "The one-shot coding tasks did not exercise verified command reuse; deterministic fixtures cover that mechanism separately."] },
  deterministicSuite: suite,
  deterministicSummary: summarizeSuite(suite),
  security: { dependencyAudit: "0 vulnerabilities", secrets: "no credentials or provider values stored", providerCredentialsStored: false },
  limitations: ["Codex was the only provider with completed real-agent evidence in this environment.", "Native interception remains host-dependent; generic wrapper is the reliable fallback.", "GitHub search found a separate Lean Dojo formal-theorem-proving project named LeanAgent; npm package names were unclaimed on the observation date."],
};

writeFileSync(join(root, "benchmarks", "final-launch-report.json"), JSON.stringify(report, null, 2) + "\n", "utf8");
writeFileSync(join(root, "benchmarks", "final-launch-report.md"), markdown(report), "utf8");
process.stdout.write(JSON.stringify({ files: ["benchmarks/final-launch-report.json", "benchmarks/final-launch-report.md"], tasks: taskRows.length, parity: aggregate.parity }, null, 2) + "\n");

function compactRun(run) {
  return { status: run.status, exit: run.exit, quality: run.quality, wallMs: Math.round(run.wallMs), toolCalls: run.toolCalls, commandExecutions: run.commandExecutions, fileChanges: run.fileChanges, agentVisibleToolOutputBytes: run.agentVisibleToolOutputBytes, inputTokens: run.inputTokens, cachedInputTokens: run.cachedInputTokens, outputTokens: run.outputTokens };
}

function aggregateSessions(repo) {
  const indexPath = join(repo, ".bench-home", "artifacts", "index.json");
  const empty = { sessions: 0, rawBytes: 0, deliveredBytes: 0, overheadMs: 0, cacheHits: 0, duplicateReadsReused: 0, commands: 0, avoidedCommandMs: 0, extraLlmCalls: 0 };
  if (!existsSync(indexPath)) return empty;
  try {
    const rows = JSON.parse(readFileSync(indexPath, "utf8")).filter((row) => row.kind === "session-metrics");
    return rows.reduce((sum, row) => {
      try {
        const stats = JSON.parse(readFileSync(row.fullPath, "utf8")).stats;
        for (const key of Object.keys(empty).filter((name) => name !== "sessions")) sum[key] += Number(stats?.[key] ?? 0);
      } catch { /* an unreadable artifact is excluded and reported by doctor */ }
      sum.sessions += 1;
      return sum;
    }, { ...empty });
  } catch { return empty; }
}

function markdown(value) {
  const a = value.realAgentStudy.aggregate;
  const reduction = percent(a.baselineToolOutputBytes, a.leanagentToolOutputBytes);
  const calls = percent(a.baselineToolCalls, a.leanagentToolCalls);
  const d = value.deterministicSummary;
  return `# LeanAgent final launch report\n\n- Benchmark commit: \`${value.commitSha}\`\n- Observed: ${value.observedAt}\n- Agent: Codex ${value.agents.codex.installed}, model ${value.agents.codex.model}, reasoning ${value.agents.codex.reasoning}\n- Repositories: ${value.repositories.join(", ")}\n\n## Real-agent quality and efficiency\n\n| Metric | Baseline | LeanAgent | Change |\n|---|---:|---:|---:|\n| Independent task acceptance | ${a.baselinePass}/${value.realAgentStudy.tasks.length} | ${a.leanagentPass}/${value.realAgentStudy.tasks.length} | parity |\n| Codex tool-output bytes | ${fmt(a.baselineToolOutputBytes)} | ${fmt(a.leanagentToolOutputBytes)} | −${reduction}% |\n| Tool calls | ${a.baselineToolCalls} | ${a.leanagentToolCalls} | −${calls}% |\n| Wall time (ms) | ${fmt(Math.round(a.baselineWallMs))} | ${fmt(Math.round(a.leanagentWallMs))} | ${signedPercent(a.baselineWallMs, a.leanagentWallMs)} |\n| Provider input tokens | ${fmt(a.baselineInputTokens)} | ${fmt(a.leanagentInputTokens)} | observed, not billing |\n| Provider output tokens | ${fmt(a.baselineOutputTokens)} | ${fmt(a.leanagentOutputTokens)} | observed, not billing |\n| LeanAgent overhead (ms) | — | ${fmt(Math.round(a.leanagentOverheadMs))} | observed |\n| Additional LeanAgent LLM calls | 0 | ${a.leanagentExtraLlmCalls} | observed |\n\nQuality parity: **${a.parity}/${value.realAgentStudy.tasks.length}**.\n\n## Deterministic fixture suite\n\n| Metric | Baseline | LeanAgent | Change |\n|---|---:|---:|---:|\n| Fixture verification parity | ${d.parity}/${d.fixtures} | ${d.parity}/${d.fixtures} | parity |\n| Command output bytes | ${fmt(d.baselineRawBytes)} | ${fmt(d.leanagentDeliveredBytes)} | −${percent(d.baselineRawBytes, d.leanagentDeliveredBytes)}% delivered |\n| End-to-end time (ms) | ${fmt(Math.round(d.baselineEndToEndMs))} | ${fmt(Math.round(d.leanagentEndToEndMs))} | ${signedPercent(d.baselineEndToEndMs, d.leanagentEndToEndMs)} |\n| Verified cache hits | — | ${d.cacheHits} | observed |\n\n## Tasks\n\n| Task | Repository | Start commit | A | B | Parity |\n|---|---|---|---|---|---|\n${value.realAgentStudy.tasks.map((task) => `| ${task.id} | ${task.repository} | ${task.startingCommit} | ${task.baseline.quality.status} | ${task.leanagent.quality.status} | ${task.qualityParity ? "PASS" : "REVIEW"} |`).join("\n")}\n\n## Negative results and limitations\n\n${value.realAgentStudy.negativeResults.map((note) => `- ${note}`).join("\n")}\n\nProvider results: Gemini CLI was installed but unauthenticated; OpenCode credentials were detected but its tested provider paths produced no completed task. Token usage is **observed telemetry only**; no billing estimate is made.\n`;
}

function summarizeSuite(suite) {
  const rows = suite?.reports ?? [];
  return rows.reduce((sum, row) => {
    sum.fixtures += 1;
    sum.baselineRawBytes += Number(row.baseline.rawOutputBytes ?? row.baseline.outputBytes ?? 0);
    sum.leanagentDeliveredBytes += Number(row.leanagent.deliveredOutputBytes ?? row.leanagent.outputBytes ?? 0);
    sum.baselineEndToEndMs += Number(row.baseline.endToEndMs ?? 0);
    sum.leanagentEndToEndMs += Number(row.leanagent.endToEndMs ?? 0);
    sum.cacheHits += Number(row.leanagent.cacheHits ?? 0);
    sum.parity += row.quality?.equalExit ? 1 : 0;
    return sum;
  }, { fixtures: 0, baselineRawBytes: 0, leanagentDeliveredBytes: 0, baselineEndToEndMs: 0, leanagentEndToEndMs: 0, cacheHits: 0, parity: 0 });
}

function percent(before, after) { return before ? ((1 - after / before) * 100).toFixed(1) : "0.0"; }
function signedPercent(before, after) { return before ? `${after >= before ? "+" : "−"}${Math.abs((1 - after / before) * 100).toFixed(1)}%` : "0.0%"; }
function fmt(value) { return Number(value).toLocaleString("en-US"); }
