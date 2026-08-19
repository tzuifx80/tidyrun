import ts from "typescript";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const sourceRoots = [join(root, "packages"), join(root, "scripts")];
const files = sourceRoots.flatMap((dir) => collect(dir));
const failures = [];

for (const file of files) {
  const text = readFileSync(file, "utf8");
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const visit = (node) => {
    if (node.kind === ts.SyntaxKind.DebuggerStatement) failures.push(`${display(file)}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}: debugger statement`);
    if (node.kind === ts.SyntaxKind.AnyKeyword) failures.push(`${display(file)}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}: explicit any is not allowed`);
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (/\/\/\s*@ts-(?:ignore|nocheck)\b/.test(text)) failures.push(`${display(file)}: TypeScript suppression comment requires review`);
}

if (failures.length) {
  process.stderr.write(`${failures.join("\n")}\n`);
  process.exit(1);
}

const npmCli = process.env.npm_execpath;
const command = npmCli ? process.execPath : process.platform === "win32" ? process.env.ComSpec : "npm";
const args = npmCli ? [npmCli, "run", "typecheck"] : process.platform === "win32" ? ["/d", "/s", "/c", "npm run typecheck"] : ["run", "typecheck"];
const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
process.exit(result.status ?? 1);

function collect(dir) {
  if (!statSync(dir, { throwIfNoEntry: false })) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name === "coverage") continue;
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) out.push(...collect(path));
    else if (/\.(?:ts|mts|cts|mjs)$/.test(name) && !/\.test\.(?:ts|mts|cts|mjs)$/.test(name)) out.push(path);
  }
  return out;
}

function display(file) {
  return relative(root, file).replaceAll("\\", "/");
}
