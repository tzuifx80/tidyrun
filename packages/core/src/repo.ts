import { existsSync, lstatSync, readdirSync, readFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { extname, join, relative, resolve, dirname, normalize } from "node:path";
import { sha256, sha256File, safeRepositoryPath, globishMatch } from "./util.js";
import type { RepositoryState } from "./types.js";

const SKIP = new Set(["node_modules", "dist", "build", ".git", "coverage", ".next", ".tidyrun", ".arts", "target", ".venv"]);
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".rs", ".go", ".java", ".kt", ".rb", ".php", ".c", ".h", ".cpp", ".cc", ".cs", ".json", ".md", ".yaml", ".yml", ".toml", ".ini", ".cfg", ".lock", ".txt"]);
const IMPORTANT_FILES = new Set(["Makefile", "Dockerfile", "Gemfile", "Rakefile", "requirements.txt", "Pipfile", "Pipfile.lock", ".env", ".env.local", ".env.test", "tsconfig.json", "pyproject.toml", "Cargo.toml", "go.mod"]);

export interface RepoIndex {
  root: string;
  files: string[];
  languages: string[];
  tests: string[];
  imports: Record<string, string[]>;
  /** Imports resolved to repository-relative files where the heuristic can prove the target. */
  resolvedImports: Record<string, string[]>;
  symbols: Record<string, string[]>;
  packages: string[];
  generated: string[];
  fileHashes: Record<string, string>;
  createdAt: number;
  buildSystems: string[];
}

export function indexRepository(root: string, cap = 2_000): RepoIndex {
  const files: string[] = [];
  walk(root, root, files, cap);
  const imports: Record<string, string[]> = {};
  const symbols: Record<string, string[]> = {};
  const fileHashes: Record<string, string> = {};
  const generated: string[] = [];
  for (const file of files) {
    const abs = join(root, file);
    try {
      const size = statSync(abs).size;
      fileHashes[file] = sha256File(abs);
      // Do not load multi-megabyte logs/assets into the parser. They still
      // participate in invalidation through their streaming hash.
      if (size > 2_000_000) {
        imports[file] = [];
        symbols[file] = [];
        continue;
      }
      const text = readFileSync(abs, "utf8");
      if (/generated|auto[- ]generated|do not edit/i.test(text.slice(0, 500))) generated.push(file);
      imports[file] = extractImports(text);
      symbols[file] = extractSymbols(text, extname(file));
    } catch {
      /* A file can disappear during an index scan; omit it safely. */
    }
  }
  const languages: string[] = [];
  const extensionLanguage: Record<string, string> = {
    ".ts": "typescript", ".tsx": "typescript", ".js": "javascript", ".jsx": "javascript", ".py": "python",
    ".rs": "rust", ".go": "go", ".java": "java", ".kt": "kotlin", ".rb": "ruby", ".php": "php", ".cs": "csharp",
    ".c": "c", ".h": "c", ".cpp": "cpp",
  };
  for (const [ext, language] of Object.entries(extensionLanguage)) if (files.some((file) => file.endsWith(ext)) && !languages.includes(language)) languages.push(language);
  const knownFiles = new Set(files);
  const resolvedImports: Record<string, string[]> = {};
  for (const file of files) resolvedImports[file] = (imports[file] ?? []).map((specifier) => resolveImport(file, specifier, knownFiles)).filter((value): value is string => Boolean(value));
  const tests = files.filter((f) => /(^|\/)(test|tests|__tests__|spec)\//.test(f) || /\.(test|spec)\.[^.]+$/.test(f) || /(^|\/)(test|spec)[^/]*\.[^.]+$/.test(f));
  const packages = files.filter((f) => /(^|\/)(package\.json|pyproject\.toml|Cargo\.toml|go\.mod|pom\.xml)$/.test(f));
  return { root, files, languages, tests, imports, resolvedImports, symbols, packages, generated, fileHashes, buildSystems: detectBuildSystems(root), createdAt: Date.now() };
}

/** Discover repository-relative files without opening their contents. */
export function discoverRepositoryFiles(root: string, cap = 2_000): string[] {
  const files: string[] = [];
  walk(root, root, files, cap);
  return files;
}

function walk(root: string, dir: string, files: string[], cap: number): void {
  if (files.length >= cap || !existsSync(dir)) return;
  let names: string[];
  try { names = readdirSync(dir); } catch { return; }
  for (const name of names.sort()) {
    if (SKIP.has(name)) continue;
    const abs = join(dir, name);
    let st;
    try { st = lstatSync(abs); } catch { continue; }
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) walk(root, abs, files, cap);
    else if (st.isFile()) {
      const rel = relative(root, abs).replaceAll("\\", "/");
      if (SOURCE_EXTENSIONS.has(extname(name).toLowerCase()) || IMPORTANT_FILES.has(name) || /(^|\/)(Makefile|Dockerfile)$/.test(rel)) files.push(rel);
      if (files.length >= cap) return;
    }
  }
}

function extractImports(text: string): string[] {
  const values = new Set<string>();
  const patterns = [
    /(?:import|export)\s+(?:[^"']+from\s+)?["']([^"']+)["']/g,
    /import\(\s*["']([^"']+)["']\s*\)/g,
    /require\(\s*["']([^"']+)["']\s*\)/g,
    /(?:from|import)\s+([A-Za-z_][\w.]*)/g,
    /use\s+([A-Za-z_][\w:]*)/g,
  ];
  for (const pattern of patterns) for (const match of text.matchAll(pattern)) if (match[1]) values.add(match[1]);
  return [...values].slice(0, 200);
}

function extractSymbols(text: string, extension: string): string[] {
  const values = new Set<string>();
  const patterns = extension === ".py"
    ? [/^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)/gm, /^\s*class\s+([A-Za-z_]\w*)/gm]
    : [/\b(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g, /\b(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/g, /\b(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g, /\bfn\s+([A-Za-z_]\w*)/g];
  for (const pattern of patterns) for (const match of text.matchAll(pattern)) if (match[1]) values.add(match[1]);
  return [...values].slice(0, 200);
}

export function affectedTests(index: RepoIndex, changed: string[]): { tests: string[]; why: Record<string, string> } {
  const why: Record<string, string> = {};
  const selected = new Set<string>();
  const normalized = changed.map((item) => normalizeChangedPath(index.root, item));
  const reverse = new Map<string, string[]>();
  for (const [file, imports] of Object.entries(index.resolvedImports ?? {})) {
    for (const imported of imports) reverse.set(imported, [...(reverse.get(imported) ?? []), file]);
  }
  const affected = new Set<string>();
  const queue = [...normalized];
  while (queue.length) {
    const file = queue.shift()!;
    if (affected.has(file)) continue;
    affected.add(file);
    for (const dependent of reverse.get(file) ?? []) queue.push(dependent);
  }
  for (const file of normalized) {
    const base = file.split("/").pop() ?? file;
    const stem = base.replace(/\.(ts|tsx|js|jsx|py|rs|go|java|kt|rb|php|cs)$/, "");
    const changedImports = new Set(index.imports[file] ?? []);
    for (const test of index.tests) {
      const testImports = index.imports[test] ?? [];
      const importsChanged = affected.has(test) || testImports.some((item) => item.endsWith(`/${stem}`) || item === `./${stem}` || changedImports.has(item));
      const broadConfig = /(^|\/)(?:package(?:-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|tsconfig(?:\.[^/]+)?\.json|pyproject\.toml|requirements(?:\.[^/]+)?\.txt|Cargo\.toml|go\.mod)$/.test(file);
      if (broadConfig || test === file || test.includes(stem) || sameDir(file, test) || importsChanged) {
        selected.add(test);
        why[test] = broadConfig ? `configuration/dependency change ${file} may affect the whole test suite` : importsChanged ? `${test} transitively imports or references changed module ${file}` : `changed ${file} shares name/path with ${test}`;
      }
    }
  }
  if (selected.size === 0) {
    for (const test of index.tests.slice(0, 8)) {
      selected.add(test);
      why[test] = "fallback: no direct relationship found; conservative sample";
    }
  }
  return { tests: [...selected], why };
}

function normalizeChangedPath(root: string, file: string): string {
  const absolute = resolve(root, file);
  return relative(root, absolute).replaceAll("\\", "/");
}

function resolveImport(from: string, specifier: string, known: Set<string>): string | undefined {
  if (!specifier.startsWith(".")) return undefined;
  const base = normalize(join(dirname(from), specifier)).replaceAll("\\", "/");
  const candidates = [base, ...[".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py"].map((ext) => `${base}${ext}`), ...["index.ts", "index.tsx", "index.js", "index.jsx", "__init__.py"].map((name) => `${base}/${name}`)];
  return candidates.find((candidate) => known.has(candidate));
}

function sameDir(a: string, b: string): boolean {
  const da = a.split("/").slice(0, -1).join("/");
  const db = b.split("/").slice(0, -1).join("/");
  return Boolean(da) && da === db;
}

export function snapshotRepository(root: string, files?: string[], ignore: string[] = [], previous?: RepositoryState, options: { fast?: boolean } = {}): RepositoryState {
  const fast = options.fast === true;
  const discovered = files ?? discoverRepositoryFiles(root);
  const index = discovered.filter((file) => !ignore.some((pattern) => globishMatch(file, pattern)));
  const fileHashes: Record<string, string> = {};
  const fileMetadata: Record<string, string> = {};
  let metadataChanged = !previous?.fileMetadata;
  for (const file of index) {
    try {
      const absolute = safeRepositoryPath(root, file, { followSymlinks: false });
      const stat = statSync(absolute);
      const metadata = `${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}:${stat.mode}:${stat.ino}`;
      fileMetadata[file] = metadata;
      if (previous?.fileMetadata?.[file] !== metadata) metadataChanged = true;
      fileHashes[file] = fast ? sha256(metadata) : sha256File(absolute);
    } catch { /* ignore transient files */ }
  }
  if (previous?.fileMetadata && Object.keys(previous.fileMetadata).length !== Object.keys(fileMetadata).length) metadataChanged = true;
  const hasGit = existsSync(join(root, ".git"));
  const gitMetadata = hasGit ? gitStatFingerprint(root) : undefined;
  const reuseGitState = Boolean(previous && !metadataChanged && previous.gitMetadata === gitMetadata);
  const headFromDisk = hasGit ? readGitHead(root) : undefined;
  const hasCommit = Boolean(headFromDisk);
  const dirtyFiles = hasGit && hasCommit ? reuseGitState ? previous?.dirtyFiles ?? [] : gitLines(root, ["status", "--porcelain"]).map((line) => line.slice(3).trim()).filter(Boolean) : [];
  const gitHead = hasGit && hasCommit ? reuseGitState ? previous?.gitHead : headFromDisk : undefined;
  const gitIndexHash = sha256(JSON.stringify(Object.entries(fileHashes).sort(([a], [b]) => a.localeCompare(b))));
  // Do not include directory mtime: harmless reads and platform-specific mtime
  // granularity otherwise create false cache misses. File hashes and git status
  // already capture the state relevant to deterministic commands.
  return { root, gitHead, gitIndexHash, gitMetadata, dirtyFiles, fileHashes, fileMetadata, fingerprint: sha256(`${gitHead ?? "nogit"}\n${gitIndexHash}\n${dirtyFiles.join("\n")}`), capturedAt: Date.now() };
}

function gitStatFingerprint(root: string): string {
  // Do not include the .git directory mtime itself: git status updates it as a
  // side effect on some platforms, which would defeat the fast path.
  const paths = [join(root, ".git", "HEAD"), join(root, ".git", "index"), join(root, ".git", "packed-refs")];
  return paths.map((path) => {
    try { const stat = statSync(path); return `${path}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`; }
    catch { return `${path}:missing`; }
  }).join("\n");
}

function readGitHead(root: string): string | undefined {
  try {
    const head = readFileSync(join(root, ".git", "HEAD"), "utf8").trim();
    if (!head) return undefined;
    if (!head.startsWith("ref: ")) return head;
    const ref = head.slice(5);
    try {
      const value = readFileSync(join(root, ".git", ...ref.split("/")), "utf8").trim();
      if (value) return value;
    } catch { /* packed refs may contain the branch */ }
    try {
      const packed = readFileSync(join(root, ".git", "packed-refs"), "utf8").split(/\r?\n/).find((line) => line.endsWith(` ${ref}`));
      return packed?.split(" ")[0];
    } catch { return undefined; }
  } catch { return undefined; }
}

function gitLines(cwd: string, args: string[]): string[] {
  try {
    return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim().split(/\r?\n/).filter(Boolean);
  } catch { return []; }
}

export function detectStack(root: string): string[] {
  const hits: string[] = [];
  if (existsSync(join(root, "package.json"))) hits.push("node");
  if (existsSync(join(root, "pnpm-lock.yaml"))) hits.push("pnpm");
  if (existsSync(join(root, "package-lock.json"))) hits.push("npm");
  if (existsSync(join(root, "yarn.lock"))) hits.push("yarn");
  if (existsSync(join(root, "bun.lockb")) || existsSync(join(root, "bun.lock"))) hits.push("bun");
  if (existsSync(join(root, "pyproject.toml")) || existsSync(join(root, "requirements.txt"))) hits.push("python");
  if (existsSync(join(root, "Cargo.toml"))) hits.push("rust");
  if (existsSync(join(root, "go.mod"))) hits.push("go");
  try {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { devDependencies?: Record<string, string>; dependencies?: Record<string, string> };
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const [name, label] of [["vitest", "vitest"], ["jest", "jest"], ["playwright", "playwright"], ["next", "next"], ["eslint", "eslint"]] as const) if (deps[name]) hits.push(label);
  } catch { /* optional */ }
  return [...new Set(hits)];
}

export function detectBuildSystems(root: string): string[] {
  const systems: string[] = [];
  const markers: Array<[string, string]> = [["turbo.json", "turborepo"], ["nx.json", "nx"], ["WORKSPACE", "bazel"], ["WORKSPACE.bazel", "bazel"], ["BUILD.bazel", "bazel"], ["gradlew", "gradle"], ["Cargo.toml", "cargo"], ["Makefile", "make"], ["CMakeLists.txt", "cmake"], ["tsconfig.json", "typescript"]];
  for (const [marker, system] of markers) if (existsSync(join(root, marker)) && !systems.includes(system)) systems.push(system);
  return systems;
}
