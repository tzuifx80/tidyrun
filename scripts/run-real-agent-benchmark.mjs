import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

// Controlled, opt-in benchmark. It never sends a prompt unless REAL_BENCH_RUN=1.
// Each task gets fresh A/B directories from the same generated source commit.
const root = fileURLToPath(new URL("..", import.meta.url));
const releaseCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const runEnabled = process.env.REAL_BENCH_RUN === "1";
const agent = process.env.REAL_BENCH_AGENT ?? "codex";
const timeoutMs = Number(process.env.REAL_BENCH_TIMEOUT_MS ?? 120_000);
const packageTarball = process.env.LEANAGENT_TARBALL ?? join(tmpdir(), "leanagent-real-bench-package", "leanagent-0.1.0.tgz");
const outRoot = process.env.REAL_BENCH_OUT ?? join(tmpdir(), `leanagent-real-bench-${Date.now()}`);

const tasks = [
  {
    id: "py-addition-bug",
    repo: "python",
    prompt: "Fix the bug in app.py so the existing test passes. Run python -B test_app.py before and after. Make the smallest source-only change; do not change tests or unrelated files.",
    mutate: ({ root: taskRoot }) => replace(join(taskRoot, "app.py"), "return a + b", "return a - b"),
    verify: ({ root: taskRoot }) => ({ command: ["python", "-B", "test_app.py"], cwd: taskRoot }),
  },
  {
    id: "py-negative-edge",
    repo: "python",
    prompt: "Fix add in app.py so it handles negative operands correctly. Run the existing test and inspect the implementation before editing. Do not change tests or unrelated files.",
    mutate: ({ root: taskRoot }) => replace(join(taskRoot, "app.py"), "return a + b", "return 0 if a < 0 or b < 0 else a + b"),
    hidden: ({ root: taskRoot, hiddenRoot }) => writeFileSync(join(hiddenRoot, "verify.py"), "from app import add\nassert add(-2, 3) == 1\nassert add(-2, -3) == -5\n"),
    verify: ({ root: taskRoot, hiddenRoot }) => ({ command: ["python", "-B", join(hiddenRoot, "verify.py")], cwd: taskRoot, env: { PYTHONPATH: taskRoot } }),
  },
  {
    id: "py-optional-offset",
    repo: "python",
    prompt: "Add the smallest backwards-compatible optional offset parameter to add in app.py. Existing two-argument behavior must stay unchanged, and add(2, 2, 2) must return 6. Do not change tests or unrelated files.",
    mutate: ({ root: taskRoot }) => replace(join(taskRoot, "app.py"), "def add(a: int, b: int) -> int:\n    return a + b", "def add(a: int, b: int, offset: int = 0) -> int:\n    return a + b"),
    hidden: ({ hiddenRoot }) => writeFileSync(join(hiddenRoot, "verify.py"), "from app import add\nassert add(2, 2) == 4\nassert add(2, 2, 2) == 6\n"),
    verify: ({ root: taskRoot, hiddenRoot }) => ({ command: ["python", "-B", join(hiddenRoot, "verify.py")], cwd: taskRoot, env: { PYTHONPATH: taskRoot } }),
  },
  {
    id: "py-input-validation",
    repo: "python",
    prompt: "Add a focused input validation guard to add in app.py: non-integer operands must raise TypeError, while integer addition keeps working. Do not change tests or unrelated files.",
    hidden: ({ hiddenRoot }) => writeFileSync(join(hiddenRoot, "verify.py"), "from app import add\nassert add(2, 2) == 4\ntry:\n    add('2', 2)\nexcept TypeError:\n    pass\nelse:\n    raise AssertionError('expected TypeError')\n"),
    verify: ({ root: taskRoot, hiddenRoot }) => ({ command: ["python", "-B", join(hiddenRoot, "verify.py")], cwd: taskRoot, env: { PYTHONPATH: taskRoot } }),
  },
  {
    id: "py-high-output-diagnostic",
    repo: "python",
    prompt: "Investigate the failing Python check by running python -B noisy_check.py once, then fix app.py so python -B test_app.py passes. Keep the change minimal and do not edit tests or noisy_check.py.",
    mutate: ({ root: taskRoot }) => replace(join(taskRoot, "app.py"), "return a + b", "return a - b"),
    verify: ({ root: taskRoot }) => ({ command: ["python", "-B", "test_app.py"], cwd: taskRoot }),
  },
  {
    id: "ts-addition-bug",
    repo: "typescript",
    prompt: "Fix the bug in src/math.ts so the existing npm test passes. Run npm test before and after. Make the smallest source-only change and do not change tests.",
    mutate: ({ root: taskRoot }) => replace(join(taskRoot, "src", "math.ts"), "return a + b", "return a - b"),
    verify: ({ root: taskRoot }) => ({ command: ["npm", "test"], cwd: taskRoot }),
  },
  {
    id: "ts-multiply-feature",
    repo: "typescript",
    prompt: "Add and export a multiply(a, b) function in src/math.ts without changing add or the existing test. Run npm test after the smallest implementation.",
    mutate: ({ root: taskRoot, hiddenRoot }) => writeFileSync(join(hiddenRoot, "verify.ts"), `import { multiply } from ${JSON.stringify(toFileImport(join(taskRoot, "src", "math.ts")))};\nif (multiply(3, 4) !== 12) throw new Error("multiply failed");\n`),
    verify: ({ root: taskRoot, hiddenRoot }) => ({ command: ["node", "--experimental-strip-types", join(hiddenRoot, "verify.ts")], cwd: taskRoot }),
  },
  {
    id: "ts-finite-inputs",
    repo: "typescript",
    prompt: "Add a focused guard in src/math.ts so add rejects non-finite numeric inputs with a TypeError while preserving normal addition. Do not change tests or unrelated files.",
    mutate: ({ root: taskRoot, hiddenRoot }) => writeFileSync(join(hiddenRoot, "verify.ts"), `import { add } from ${JSON.stringify(toFileImport(join(taskRoot, "src", "math.ts")))};\nif (add(2, 2) !== 4) throw new Error("add failed");\ntry { add(Number.NaN, 2); } catch (error) { if (!(error instanceof TypeError)) throw error; process.exit(0); }\nthrow new Error("expected TypeError");\n`),
    verify: ({ root: taskRoot, hiddenRoot }) => ({ command: ["node", "--experimental-strip-types", join(hiddenRoot, "verify.ts")], cwd: taskRoot }),
  },
  {
    id: "ts-script-repair",
    repo: "typescript",
    prompt: "Repair the broken npm test script so it runs the existing test file and passes. Do not change test behavior or source code.",
    mutate: ({ root: taskRoot }) => replace(join(taskRoot, "package.json"), "tests/math.ts", "tests/missing.ts"),
    verify: ({ root: taskRoot }) => ({ command: ["npm", "test"], cwd: taskRoot }),
  },
  {
    id: "ts-clamp-feature",
    repo: "typescript",
    prompt: "Add and export clamp(value, min, max) to src/math.ts. It must return min below range, max above range, and value inside. Keep add unchanged and run npm test.",
    mutate: ({ root: taskRoot, hiddenRoot }) => writeFileSync(join(hiddenRoot, "verify.ts"), `import { clamp } from ${JSON.stringify(toFileImport(join(taskRoot, "src", "math.ts")))};\nif (clamp(-1, 0, 5) !== 0 || clamp(3, 0, 5) !== 3 || clamp(9, 0, 5) !== 5) throw new Error("clamp failed");\n`),
    verify: ({ root: taskRoot, hiddenRoot }) => ({ command: ["node", "--experimental-strip-types", join(hiddenRoot, "verify.ts")], cwd: taskRoot }),
  },
];

if (!runEnabled) {
  process.stdout.write(JSON.stringify({ releaseCommit, agent, taskCount: selectedTasks().length, packageTarball, note: "Set REAL_BENCH_RUN=1 to execute provider calls." }, null, 2) + "\n");
  process.exit(0);
}

if (agent !== "codex") throw new Error(`Unsupported REAL_BENCH_AGENT=${agent}; only codex is enabled for this reproducible harness.`);
if (!existsSync(packageTarball)) throw new Error(`LeanAgent tarball not found: ${packageTarball}`);
mkdirSync(outRoot, { recursive: true });
const results = [];
for (const task of selectedTasks()) {
  const taskResult = await runTask(task);
  results.push(taskResult);
  writeFileSync(join(outRoot, "real-agent-results.json"), JSON.stringify({ schema: "leanagent.real-agent/v1", releaseCommit, agent, tasks: results }, null, 2) + "\n");
}
process.stdout.write(JSON.stringify({ schema: "leanagent.real-agent/v1", releaseCommit, agent, outRoot, tasks: results }, null, 2) + "\n");

function selectedTasks() {
  const requested = process.env.REAL_BENCH_TASKS?.split(",").map((id) => id.trim()).filter(Boolean);
  if (!requested?.length) return tasks;
  const chosen = tasks.filter((task) => requested.includes(task.id));
  if (chosen.length !== requested.length) throw new Error(`Unknown REAL_BENCH_TASKS value: ${requested.join(",")}`);
  return chosen;
}

async function runTask(task) {
  const taskRoot = join(outRoot, task.id);
  const baselineRoot = join(taskRoot, "baseline");
  const leanRoot = join(taskRoot, "leanagent");
  const hiddenRoot = join(taskRoot, "hidden");
  mkdirSync(hiddenRoot, { recursive: true });
  prepareRepo(task, baselineRoot);
  cpSync(baselineRoot, leanRoot, { recursive: true });
  if (task.mutate) task.mutate({ root: baselineRoot, hiddenRoot });
  if (task.mutate) task.mutate({ root: leanRoot, hiddenRoot });
  if (task.hidden) task.hidden({ root: baselineRoot, hiddenRoot });
  if (task.hidden) task.hidden({ root: leanRoot, hiddenRoot });
  commitRepo(baselineRoot, "benchmark base");
  const startingCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: baselineRoot, encoding: "utf8" }).trim();
  // Keep A and B on the exact same commit; B-only runtime files are ignored.
  cpSync(join(baselineRoot, ".git"), join(leanRoot, ".git"), { recursive: true });
  const leanCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: leanRoot, encoding: "utf8" }).trim();
  if (startingCommit !== leanCommit) throw new Error(`${task.id}: A/B starting commits differ`);
  setupInstructions(baselineRoot, false);
  setupInstructions(leanRoot, true);
  setupLeanAgent(leanRoot);
  const baseline = runProvider(task.prompt, baselineRoot, join(taskRoot, "baseline.codex.jsonl"), false);
  const lean = runProvider(task.prompt, leanRoot, join(taskRoot, "leanagent.codex.jsonl"), true);
  const baselineQuality = runVerification(task, baselineRoot, hiddenRoot, "baseline");
  const leanQuality = runVerification(task, leanRoot, hiddenRoot, "leanagent");
  const stats = readLeanStats(leanRoot);
  return { id: task.id, repository: task.repo, prompt: task.prompt, startingCommit, baseline: { ...baseline, quality: baselineQuality }, leanagent: { ...lean, quality: leanQuality, stats }, qualityParity: baselineQuality.status === leanQuality.status && leanQuality.status === "PASS", metrics: summarize(baseline, baselineQuality, lean, leanQuality, stats) };
}

function prepareRepo(task, destination) {
  const source = join(root, "fixtures", task.repo === "python" ? "python-project" : "typescript-app");
  mkdirSync(destination, { recursive: true });
  cpSync(source, destination, { recursive: true });
  writeFileSync(join(destination, ".gitignore"), "node_modules/\n.leanagent/\n.bench-home/\n*.jsonl\n");
  writeFileSync(join(destination, "AGENTS.md"), "# Benchmark instructions\n\nThis is a controlled benchmark. Keep the requested change minimal, do not edit tests unless the task explicitly asks, and run the stated acceptance command.\n");
  if (task.repo === "python") writeFileSync(join(destination, "package.json"), "{\"name\":\"leanagent-python-benchmark\",\"private\":true}\n");
  else {
    const packageJson = JSON.parse(readFileSync(join(destination, "package.json"), "utf8"));
    packageJson.scripts = { test: "node --experimental-strip-types tests/math.ts" };
    writeFileSync(join(destination, "package.json"), JSON.stringify(packageJson, null, 2) + "\n");
    replace(join(destination, "tests", "math.test.ts"), ".js", ".ts");
    const original = join(destination, "tests", "math.test.ts");
    if (existsSync(original)) { const renamed = join(destination, "tests", "math.ts"); cpSync(original, renamed); }
  }
}

function setupInstructions(repo, leanagent) {
  const text = leanagent
    ? "# Benchmark instructions\n\nThis controlled task must stay focused on the repository. Do not inspect external user skill or policy files. Use `npx --no-install leanagent run -- <command>` for every test, build, or diagnostic shell command; when using PowerShell cmdlets, put them inside `pwsh -NoProfile -Command`. Do not nest `leanagent cat` inside `leanagent run`; recover an artifact with `npx --no-install leanagent cat <id>`. Keep the requested change minimal and do not edit tests unless asked.\n"
    : "# Benchmark instructions\n\nThis controlled task must stay focused on the repository. Do not inspect external user skill or policy files. Run the stated test or diagnostic commands directly; when using PowerShell cmdlets, put them inside `pwsh -NoProfile -Command`. Do not use LeanAgent or any wrapper. Keep the requested change minimal and do not edit tests unless asked.\n";
  writeFileSync(join(repo, "AGENTS.md"), text);
}

function setupLeanAgent(repo) {
  const env = { ...process.env, LEANAGENT_HOME: join(repo, ".bench-home") };
  const install = runNpm(["install", "--ignore-scripts", "--offline", "--no-save", packageTarball], repo, env);
  if (install.status !== 0) throw new Error(`LeanAgent install failed: ${install.error ? String(install.error) : install.stderr || install.stdout || `exit ${install.status}`}`);
  const init = runNpm(["exec", "--", "leanagent", "init", "--json"], repo, env);
  if (init.status !== 0) throw new Error(`LeanAgent init failed: ${init.error ? String(init.error) : init.stderr || init.stdout || `exit ${init.status}`}`);
}

function runProvider(prompt, cwd, logPath, leanagent) {
  const started = performance.now();
  const args = ["exec", "--ephemeral", "--ignore-user-config", "--ignore-rules", "--json", "--dangerously-bypass-approvals-and-sandbox", "--cd", cwd, prompt];
  if (process.env.REAL_BENCH_MODEL) args.splice(args.length - 1, 0, "--model", process.env.REAL_BENCH_MODEL);
  if (process.env.REAL_BENCH_REASONING) args.splice(args.length - 1, 0, "-c", `model_reasoning_effort=${process.env.REAL_BENCH_REASONING}`);
  const env = leanagent ? { ...process.env, LEANAGENT_HOME: join(cwd, ".bench-home") } : process.env;
  const result = spawnSync("codex", args, { cwd, env, encoding: "utf8", timeout: timeoutMs, maxBuffer: 50 * 1024 * 1024, windowsHide: true });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  writeFileSync(logPath, stdout + stderr, "utf8");
  const timedOut = result.error?.code === "ETIMEDOUT" || result.signal === "SIGTERM";
  const events = parseJsonLines(stdout);
  const commands = events.filter((event) => event.type === "item.completed" && event.item?.type === "command_execution");
  const fileChanges = events.filter((event) => event.type === "item.completed" && event.item?.type === "file_change");
  const usage = events.findLast((event) => event.type === "turn.completed")?.usage ?? {};
  const outputBytes = commands.reduce((sum, event) => sum + Buffer.byteLength(String(event.item?.aggregated_output ?? ""), "utf8"), 0);
  return { status: timedOut ? "TIMEOUT" : result.status === 0 ? "COMPLETE" : "ERROR", exit: result.status, wallMs: performance.now() - started, toolCalls: commands.length + fileChanges.length, commandExecutions: commands.length, fileChanges: fileChanges.length, agentVisibleToolOutputBytes: outputBytes, inputTokens: numberOrNull(usage.input_tokens), cachedInputTokens: numberOrNull(usage.cached_input_tokens), outputTokens: numberOrNull(usage.output_tokens), logPath };
}

function runVerification(task, cwd, hiddenRoot, side) {
  const spec = task.verify({ root: cwd, hiddenRoot, side });
  const env = { ...process.env, ...(spec.env ?? {}), PYTHONDONTWRITEBYTECODE: "1" };
  const result = spec.command[0] === "npm" ? runNpm(spec.command.slice(1), spec.cwd, env) : spawnSync(spec.command[0], spec.command.slice(1), { cwd: spec.cwd, env, encoding: "utf8", timeout: timeoutMs, maxBuffer: 20 * 1024 * 1024 });
  return { status: result.error?.code === "ETIMEDOUT" ? "TIMEOUT" : result.status === 0 ? "PASS" : "FAIL", exit: result.status, outputBytes: Buffer.byteLength(`${result.stdout ?? ""}${result.stderr ?? ""}`, "utf8") };
}

function readLeanStats(repo) {
  const env = { ...process.env, LEANAGENT_HOME: join(repo, ".bench-home") };
  const aggregate = aggregateLeanSessions(repo);
  if (aggregate) return aggregate;
  const result = runNpm(["exec", "--", "leanagent", "stats", "--json"], repo, env);
  if (result.status !== 0) return { status: "UNAVAILABLE", detail: (result.stderr || result.stdout || "").trim().slice(0, 400) };
  try {
    const parsed = JSON.parse(result.stdout);
    return parsed.stats ? { ...parsed.stats, artifact: parsed.artifact } : parsed;
  } catch { return { status: "UNPARSEABLE" }; }
}

function aggregateLeanSessions(repo) {
  const indexPath = join(repo, ".bench-home", "artifacts", "index.json");
  if (!existsSync(indexPath)) return undefined;
  try {
    const rows = JSON.parse(readFileSync(indexPath, "utf8"));
    const sessions = rows.filter((row) => row.kind === "session-metrics").flatMap((row) => {
      try { return [JSON.parse(readFileSync(row.fullPath, "utf8")).stats]; } catch { return []; }
    });
    if (!sessions.length) return undefined;
    const numeric = ["fileReads", "duplicateReadsReused", "commands", "cachedCommands", "repeatedBlocked", "loopsDetected", "loopCycles", "rawBytes", "deliveredBytes", "cacheHits", "cacheMisses", "cacheInvalidations", "commandWallMs", "avoidedCommandMs", "modelCalls", "modelInputTokens", "modelOutputTokens", "extraLlmCalls", "overheadMs", "ruleEvaluationMs", "repositorySnapshotMs", "compressionMs", "artifactMs"];
    const result = Object.fromEntries(numeric.map((key) => [key, sessions.reduce((sum, row) => sum + Number(row?.[key] ?? 0), 0)]));
    return { ...result, sessions: sessions.length };
  } catch { return undefined; }
}

function runNpm(args, cwd, env) {
  if (process.platform !== "win32") return spawnSync("npm", args, { cwd, env, encoding: "utf8", timeout: timeoutMs, maxBuffer: 20 * 1024 * 1024 });
  const command = `${process.env.ComSpec ?? "cmd.exe"}`;
  const escaped = args.map((value) => quoteCmdArg(String(value))).join(" ");
  return spawnSync(command, ["/d", "/c", `npm ${escaped}`], { cwd, env, encoding: "utf8", timeout: timeoutMs, maxBuffer: 20 * 1024 * 1024, windowsHide: true });
}

function quoteCmdArg(value) {
  // The controlled Windows runner uses workspace paths without spaces. Quoting
  // here would be re-escaped by spawnSync when passed through cmd.exe.
  return value;
}

function summarize(baseline, baselineQuality, lean, leanQuality, stats) {
  const raw = Number(stats?.rawBytes ?? 0);
  const delivered = Number(stats?.deliveredBytes ?? 0);
  return { taskSuccess: baselineQuality.status === "PASS" && leanQuality.status === "PASS", toolOutputBytes: { baseline: baseline.agentVisibleToolOutputBytes, leanagent: delivered || lean.agentVisibleToolOutputBytes }, toolCalls: { baseline: baseline.toolCalls, leanagent: lean.toolCalls }, wallMs: { baseline: baseline.wallMs, leanagent: lean.wallMs }, inputTokens: { baseline: baseline.inputTokens, leanagent: lean.inputTokens }, outputTokens: { baseline: baseline.outputTokens, leanagent: lean.outputTokens }, rawBytes: raw, deliveredBytes: delivered, overheadMs: Number(stats?.overheadMs ?? 0), cacheHits: Number(stats?.cacheHits ?? 0), duplicateReads: Number(stats?.duplicateReadsReused ?? 0) };
}

function commitRepo(repo, message) {
  execFileSync("git", ["init", "-q"], { cwd: repo });
  execFileSync("git", ["config", "user.email", "bench@example.invalid"], { cwd: repo });
  execFileSync("git", ["config", "user.name", "LeanAgent Benchmark"], { cwd: repo });
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["commit", "-qm", message], { cwd: repo });
}

function replace(path, from, to) {
  const text = readFileSync(path, "utf8");
  if (!text.includes(from)) throw new Error(`benchmark mutation did not find expected text in ${path}`);
  writeFileSync(path, text.replace(from, to));
}

function toFileImport(path) {
  return pathToFileURL(resolve(path)).href;
}

function numberOrNull(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function parseJsonLines(text) {
  return text.split(/\r?\n/).flatMap((line) => { try { return line.trim() ? [JSON.parse(line)] : []; } catch { return []; } });
}
