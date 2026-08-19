import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = new URL("..", import.meta.url);
const workspace = fileURLToPath(root);
const temp = mkdtempSync(join(tmpdir(), "tidyrun-package-smoke-"));
const install = join(temp, "install");
mkdirSync(install, { recursive: true });
writeFileSync(join(install, "package.json"), JSON.stringify({ name: "tidyrun-package-smoke", version: "1.0.0" }) + "\n");

try {
  const packageJson = JSON.parse(readFileSync(join(workspace, "packages", "tidyrun", "package.json"), "utf8"));
  const tarball = join(temp, `${packageJson.name}-${packageJson.version}.tgz`);
  runNpm(["pack", "-w", "tidyrun", "--pack-destination", temp], workspace);
  runNpm(["install", "--ignore-scripts", "--offline", tarball], install);
  const bin = join(install, "node_modules", "tidyrun", "bin", "tidyrun.mjs");
  runNode([bin, "--help"], install);
  runNode([bin, "init", "--json"], install);
  runNode([bin, "doctor", "--json"], install);
  runNode([bin, "clean", "--artifacts"], install);
  process.stdout.write("package smoke: PASS\n");
} finally {
  rmSync(temp, { recursive: true, force: true });
}

function runNode(args, cwd) {
  const result = spawnSync(process.execPath, args, { cwd, stdio: "inherit", env: { ...process.env, TIDYRUN_HOME: join(cwd, ".tidyrun-home") } });
  if (result.status !== 0) throw new Error(`node smoke command failed with status ${result.status ?? "unknown"}`);
}

function runNpm(args, cwd) {
  const npmCli = process.env.npm_execpath;
  const command = npmCli ? process.execPath : process.platform === "win32" ? process.env.ComSpec : "npm";
  const commandArgs = npmCli ? [npmCli, ...args] : process.platform === "win32" ? ["/d", "/s", "/c", `npm ${args.map(quote).join(" ")}`] : args;
  const result = spawnSync(command, commandArgs, { cwd, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`npm smoke command failed with status ${result.status ?? "unknown"}`);
}

function quote(value) {
  return /\s/.test(value) ? `"${value.replaceAll('"', '\\"')}"` : value;
}
