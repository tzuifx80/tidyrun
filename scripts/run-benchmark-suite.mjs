import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { benchmarkMarkdown, loadBenchmark, runBenchmark } from "../packages/core/dist/index.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const fixtures = process.argv.slice(2).length ? process.argv.slice(2) : ["benchmarks/output-reduction.json", "benchmarks/repeated-command.json", "benchmarks/python-output.json"];
const reports = [];
for (const fixture of fixtures) reports.push(await runBenchmark(loadBenchmark(resolve(root, fixture))));
mkdirSync(join(root, "benchmarks"), { recursive: true });
writeFileSync(join(root, "benchmarks", "suite-report.json"), `${JSON.stringify({ schema: "leanagent.benchmark-suite/v1", reports }, null, 2)}\n`, "utf8");
writeFileSync(join(root, "benchmarks", "suite-report.md"), `${reports.map(benchmarkMarkdown).join("\n\n---\n\n")}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ reports: reports.length, files: ["benchmarks/suite-report.json", "benchmarks/suite-report.md"] })}\n`);
