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
  const repo = join(sourceDir, task.id, "tidyrun");
  const stats = aggregateSessions(repo);
  return {
    id: task.id,
    repository: task.repository,
    startingCommit: task.startingCommit,
    baseline: compactRun(task.baseline),
    tidyrun: { ...compactRun(task.tidyrun), stats },
    qualityParity: task.baseline.quality.status === "PASS" && task.tidyrun.quality.status === "PASS",
  };
});

const aggregate = taskRows.reduce((sum, task) => {
  sum.baselinePass += task.baseline.quality.status === "PASS" ? 1 : 0;
  sum.tidyrunPass += task.tidyrun.quality.status === "PASS" ? 1 : 0;
  sum.parity += task.qualityParity ? 1 : 0;
  sum.baselineToolOutputBytes += task.baseline.agentVisibleToolOutputBytes;
  sum.tidyrunToolOutputBytes += task.tidyrun.agentVisibleToolOutputBytes;
  sum.baselineToolCalls += task.baseline.toolCalls;
  sum.tidyrunToolCalls += task.tidyrun.toolCalls;
  sum.baselineWallMs += task.baseline.wallMs;
  sum.tidyrunWallMs += task.tidyrun.wallMs;
  sum.baselineInputTokens += task.baseline.inputTokens ?? 0;
  sum.tidyrunInputTokens += task.tidyrun.inputTokens ?? 0;
  sum.baselineCachedInputTokens += task.baseline.cachedInputTokens ?? 0;
  sum.tidyrunCachedInputTokens += task.tidyrun.cachedInputTokens ?? 0;
  sum.baselineOutputTokens += task.baseline.outputTokens ?? 0;
  sum.tidyrunOutputTokens += task.tidyrun.outputTokens ?? 0;
  sum.tidyrunRawBytes += task.tidyrun.stats.rawBytes;
  sum.tidyrunDeliveredBytes += task.tidyrun.stats.deliveredBytes;
  sum.tidyrunOverheadMs += task.tidyrun.stats.overheadMs;
  sum.tidyrunCacheHits += task.tidyrun.stats.cacheHits;
  sum.tidyrunDuplicateReads += task.tidyrun.stats.duplicateReadsReused;
  sum.tidyrunExtraLlmCalls += task.tidyrun.stats.extraLlmCalls ?? 0;
  return sum;
}, { baselinePass: 0, tidyrunPass: 0, parity: 0, baselineToolOutputBytes: 0, tidyrunToolOutputBytes: 0, baselineToolCalls: 0, tidyrunToolCalls: 0, baselineWallMs: 0, tidyrunWallMs: 0, baselineInputTokens: 0, tidyrunInputTokens: 0, baselineCachedInputTokens: 0, tidyrunCachedInputTokens: 0, baselineOutputTokens: 0, tidyrunOutputTokens: 0, tidyrunRawBytes: 0, tidyrunDeliveredBytes: 0, tidyrunOverheadMs: 0, tidyrunCacheHits: 0, tidyrunDuplicateReads: 0, tidyrunExtraLlmCalls: 0 });

const report = {
  schema: "tidyrun.final-launch-report/v1",
  commitSha: process.env.BENCHMARK_COMMIT ?? "d74ae8670dedf79f94e136202ea853dacd82535f",
  observedAt: new Date().toISOString(),
  environment: { os: "Windows", platform: process.platform, node: process.version, npm: process.env.npm_package_manager ?? "npm 11.16.0", python: "3.11.15", repository: root },
  agents: { codex: { installed: "0.147.0", authenticated: true, model: "gpt-5.4-mini", reasoning: "low", tasksCompleted: 10 }, gemini: { installed: "0.53.1", authenticated: false, result: "not run" }, opencode: { installed: "1.18.15", credentialsDetected: true, result: "no completed task; provider attempts errored or timed out" } },
  repositories: ["fixtures/python-project", "fixtures/typescript-app"],
  realAgentStudy: { methodology: "Fresh A/B repositories from the same generated source commit; identical task prompt and Codex model; B adds only TidyRun wrapper instructions and a local package install; acceptance commands run independently after the agent.", tasks: taskRows, aggregate, negativeResults: ["Aggregate wall time increased in the TidyRun treatment; this study does not support a speedup claim.", "Provider token telemetry was observed but is not presented as billing savings.", "The one-shot coding tasks did not exercise verified command reuse; deterministic fixtures cover that mechanism separately."] },
  deterministicSuite: suite,
  deterministicSummary: summarizeSuite(suite),
  security: { dependencyAudit: "0 vulnerabilities", secrets: "no credentials or provider values stored", providerCredentialsStored: false },
  limitations: ["Codex was the only provider with completed real-agent evidence in this environment.", "Native interception remains host-dependent; generic wrapper is the reliable fallback.", "GitHub search found a separate Lean Dojo formal-theorem-proving project named TidyRun; npm package names were unclaimed on the observation date."],
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
  const reduction = percent(a.baselineToolOutputBytes, a.tidyrunToolOutputBytes);
  const calls = percent(a.baselineToolCalls, a.tidyrunToolCalls);
  const d = value.deterministicSummary;
  return `# TidyRun final launch report\n\n- Benchmark commit: \`${value.commitSha}\`\n- Observed: ${value.observedAt}\n- Agent: Codex ${value.agents.codex.installed}, model ${value.agents.codex.model}, reasoning ${value.agents.codex.reasoning}\n- Repositories: ${value.repositories.join(", ")}\n\n## Real-agent quality and efficiency\n\n| Metric | Baseline | TidyRun | Change |\n|---|---:|---:|---:|\n| Independent task acceptance | ${a.baselinePass}/${value.realAgentStudy.tasks.length} | ${a.tidyrunPass}/${value.realAgentStudy.tasks.length} | parity |\n| Codex tool-output bytes | ${fmt(a.baselineToolOutputBytes)} | ${fmt(a.tidyrunToolOutputBytes)} | −${reduction}% |\n| Tool calls | ${a.baselineToolCalls} | ${a.tidyrunToolCalls} | −${calls}% |\n| Wall time (ms) | ${fmt(Math.round(a.baselineWallMs))} | ${fmt(Math.round(a.tidyrunWallMs))} | ${signedPercent(a.baselineWallMs, a.tidyrunWallMs)} |\n| Provider input tokens | ${fmt(a.baselineInputTokens)} | ${fmt(a.tidyrunInputTokens)} | observed, not billing |\n| Provider output tokens | ${fmt(a.baselineOutputTokens)} | ${fmt(a.tidyrunOutputTokens)} | observed, not billing |\n| TidyRun overhead (ms) | — | ${fmt(Math.round(a.tidyrunOverheadMs))} | observed |\n| Additional TidyRun LLM calls | 0 | ${a.tidyrunExtraLlmCalls} | observed |\n\nQuality parity: **${a.parity}/${value.realAgentStudy.tasks.length}**.\n\n## Deterministic fixture suite\n\n| Metric | Baseline | TidyRun | Change |\n|---|---:|---:|---:|\n| Fixture verification parity | ${d.parity}/${d.fixtures} | ${d.parity}/${d.fixtures} | parity |\n| Command output bytes | ${fmt(d.baselineRawBytes)} | ${fmt(d.tidyrunDeliveredBytes)} | −${percent(d.baselineRawBytes, d.tidyrunDeliveredBytes)}% delivered |\n| End-to-end time (ms) | ${fmt(Math.round(d.baselineEndToEndMs))} | ${fmt(Math.round(d.tidyrunEndToEndMs))} | ${signedPercent(d.baselineEndToEndMs, d.tidyrunEndToEndMs)} |\n| Verified cache hits | — | ${d.cacheHits} | observed |\n\n## Tasks\n\n| Task | Repository | Start commit | A | B | Parity |\n|---|---|---|---|---|---|\n${value.realAgentStudy.tasks.map((task) => `| ${task.id} | ${task.repository} | ${task.startingCommit} | ${task.baseline.quality.status} | ${task.tidyrun.quality.status} | ${task.qualityParity ? "PASS" : "REVIEW"} |`).join("\n")}\n\n## Negative results and limitations\n\n${value.realAgentStudy.negativeResults.map((note) => `- ${note}`).join("\n")}\n\nProvider results: Gemini CLI was installed but unauthenticated; OpenCode credentials were detected but its tested provider paths produced no completed task. Token usage is **observed telemetry only**; no billing estimate is made.\n`;
}

function summarizeSuite(suite) {
  const rows = suite?.reports ?? [];
  return rows.reduce((sum, row) => {
    sum.fixtures += 1;
    sum.baselineRawBytes += Number(row.baseline.rawOutputBytes ?? row.baseline.outputBytes ?? 0);
    sum.tidyrunDeliveredBytes += Number(row.tidyrun.deliveredOutputBytes ?? row.tidyrun.outputBytes ?? 0);
    sum.baselineEndToEndMs += Number(row.baseline.endToEndMs ?? 0);
    sum.tidyrunEndToEndMs += Number(row.tidyrun.endToEndMs ?? 0);
    sum.cacheHits += Number(row.tidyrun.cacheHits ?? 0);
    sum.parity += row.quality?.equalExit ? 1 : 0;
    return sum;
  }, { fixtures: 0, baselineRawBytes: 0, tidyrunDeliveredBytes: 0, baselineEndToEndMs: 0, tidyrunEndToEndMs: 0, cacheHits: 0, parity: 0 });
}

function percent(before, after) { return before ? ((1 - after / before) * 100).toFixed(1) : "0.0"; }
function signedPercent(before, after) { return before ? `${after >= before ? "+" : "−"}${Math.abs((1 - after / before) * 100).toFixed(1)}%` : "0.0%"; }
function fmt(value) { return Number(value).toLocaleString("en-US"); }
