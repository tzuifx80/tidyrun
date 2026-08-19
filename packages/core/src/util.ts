import { createHash } from "node:crypto";
import { normalize, resolve, sep, relative, dirname, join, delimiter } from "node:path";
import { realpathSync, lstatSync, existsSync, openSync, readSync, closeSync } from "node:fs";
import type { ArtifactRecord, LeanConfig } from "./types.js";

export function sha256(text: string | Buffer): string {
  return createHash("sha256").update(text).digest("hex");
}

/** Hash a file in bounded chunks so repository snapshots cannot exhaust memory. */
export function sha256File(path: string): string {
  const hash = createHash("sha256");
  const fd = openSync(path, "r");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let bytesRead = 0;
    do {
      bytesRead = readSync(fd, buffer, 0, buffer.length, null);
      if (bytesRead) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead);
    return hash.digest("hex");
  } finally {
    closeSync(fd);
  }
}

export function normalizePath(cwd: string, input: string): string {
  const resolved = resolve(cwd, input);
  return normalize(resolved);
}

export function pathWithin(root: string, candidate: string): boolean {
  const rel = relative(resolve(root), resolve(candidate));
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !/^[A-Za-z]:/.test(rel));
}

/** Resolve a repository path while rejecting traversal and unsafe symlink targets. */
export function safeRepositoryPath(root: string, input: string, options: { allowOutside?: boolean; followSymlinks?: boolean } = {}): string {
  if (typeof input !== "string" || input.includes("\0")) throw new Error("path contains invalid characters");
  const candidate = normalizePath(root, input);
  if (!options.allowOutside && !pathWithin(root, candidate)) throw new Error("path is outside the repository");
  let current = resolve(root);
  const parts = relative(resolve(root), candidate).split(sep).filter(Boolean);
  for (const part of parts) {
    current = resolve(current, part);
    try {
      const stat = lstatSync(current);
      if (!stat.isSymbolicLink()) continue;
      if (!options.followSymlinks) throw new Error("symlink access is disabled");
      current = realpathSync(current);
      if (!options.allowOutside && !pathWithin(root, current)) throw new Error("symlink target is outside the repository");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      break;
    }
  }
  if (!options.allowOutside && !pathWithin(root, current)) throw new Error("symlink target is outside the repository");
  return current;
}

export function environmentFingerprint(env: NodeJS.ProcessEnv = process.env): string {
  const relevant = Object.keys(env)
    .filter((key) => /^(NODE_ENV|CI|PATH|PYTHON|VIRTUAL_ENV|JAVA_HOME|RUSTUP|CARGO|GO|PNPM|NPM_CONFIG|YARN)/i.test(key))
    .sort()
    .map((key) => `${key}=${env[key] ?? ""}`)
    .join("\n");
  return sha256(relevant);
}

export function resolveExecutable(name: string): { file: string; prefix: string[] } {
  if (process.platform !== "win32" || /[.][A-Za-z0-9]+$/.test(name) || name.includes("\\") || name.includes("/")) return { file: name, prefix: [] };
  const command = name.toLowerCase();
  const nodeDir = dirname(process.execPath);
  const npmScript = join(nodeDir, "node_modules", "npm", "bin", command === "npx" ? "npx-cli.js" : "npm-cli.js");
  if ((command === "npm" || command === "npx") && existsSync(npmScript)) return { file: process.execPath, prefix: [npmScript] };
  const corepackScript = join(nodeDir, "node_modules", "corepack", "dist", "corepack.js");
  if ((command === "pnpm" || command === "yarn" || command === "corepack") && existsSync(corepackScript)) return { file: process.execPath, prefix: [corepackScript, ...(command === "corepack" ? [] : [command])] };
  const commandFiles: Record<string, string> = { node: "node.exe", bun: "bun.exe", deno: "deno.exe", python: "python.exe", py: "py.exe" };
  if (commandFiles[command]) return { file: commandFiles[command], prefix: [] };
  for (const dir of (process.env.PATH ?? "").split(delimiter).filter(Boolean)) {
    const candidate = join(dir, `${name}.exe`);
    if (existsSync(candidate)) return { file: candidate, prefix: [] };
  }
  // .cmd files cannot be spawned with shell:false without reintroducing shell
  // parsing. Refuse rather than turning arbitrary agent text into a shell line.
  return { file: `${name}.exe`, prefix: [] };
}

export function globishMatch(path: string, pattern: string): boolean {
  const unix = path.split(sep).join("/");
  const escaped = pattern
    .split("/")
    .join("/")
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, ":::GLOBSTAR:::")
    .replace(/\*/g, "[^/]*")
    .replace(/:::GLOBSTAR:::/g, ".*");
  return new RegExp(`^${escaped}$`).test(unix) || unix.includes(pattern.replaceAll("**/", "").replaceAll("*", ""));
}

export function looksBinary(buf: Buffer): boolean {
  const sample = buf.subarray(0, Math.min(buf.length, 8000));
  if (sample.includes(0)) return true;
  let weird = 0;
  for (const byte of sample) {
    if (byte < 9 || (byte > 13 && byte < 32)) weird += 1;
  }
  return weird / sample.length > 0.3;
}

export function redactSecrets(text: string): string {
  return text
    // Provider/API tokens and cloud credentials. Keep the key name where it helps
    // diagnose a failure, but never persist the value.
    .replace(/\b(?:sk-(?:ant-)?|AIza|ghp_|github_pat_|nvapi-|xox[baprs]-)[A-Za-z0-9._-]{8,}/g, "[REDACTED]")
    .replace(/\bAKIA[0-9A-Z]{12,}\b/g, "[REDACTED]")
    .replace(/\b(?:aws_secret_access_key|aws_session_token)\s*[:=]\s*["']?[^"'\s]+/gi, "$1=[REDACTED]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/\b(?:authorization|proxy-authorization)\s*:\s*[^\r\n]+/gi, "$1: [REDACTED]")
    .replace(/(api[_-]?key|token|password|secret|client_secret)\s*[:=]\s*["']?[^"'\s,;&]+/gi, "$1=[REDACTED]")
    .replace(/-----BEGIN [^-]+ PRIVATE KEY-----[\s\S]*?-----END [^-]+ PRIVATE KEY-----/g, "[REDACTED PRIVATE KEY]")
    .replace(/([?&](?:access_token|api_key|token|password)=)[^&\s]+/gi, "$1[REDACTED]");
}

export function classifyCommand(command: string): "PURE" | "READ_ONLY" | "LIKELY_SAFE" | "STATEFUL" | "DESTRUCTIVE" | "UNKNOWN" {
  const c = command.trim().toLowerCase();
  if (/\b(?:rm(?:\s+-[a-z]*f[a-z]*)?|rmdir|git\s+reset\s+--hard|git\s+clean\s+-[a-z]*f|drop\s+(?:table|database)|format\s+|del\s+\/s|terraform\s+destroy|docker\s+system\s+prune)\b/.test(c)) return "DESTRUCTIVE";
  if (/\bcurl\b[^\n]*(?:-x\s*post|--request\s+post|--data(?:-raw)?\b)/.test(c) || /\b(?:database\s+migration|migrate|alembic\s+upgrade|prisma\s+migrate|rails\s+db:migrate|dotnet\s+ef\s+database\s+update)\b/.test(c)) return "STATEFUL";
  if (/(?:^|\s)(?:\d?>|>>|\|\s*tee\b)/.test(c)) return "STATEFUL";
  if (/\b(?:npm\s+(?:i|install|publish)|pnpm\s+(?:i|install)|yarn\s+(?:add|install)|pip\s+install|uv\s+(?:add|pip\s+install)|git\s+(?:commit|push|checkout|merge|rebase)|mkdir|mv\s+|move\s+|cp\s+|copy\s+|chmod\s+|chown\s+|terraform\s+apply|docker\s+compose\s+(?:up|down|run)|curl\s+[^\n]*(?:-X\s*POST|--request\s+POST|--data(?:-raw)?\s)|(?:alembic\s+upgrade|prisma\s+migrate|rails\s+db:migrate|dotnet\s+ef\s+database\s+update))\b/.test(c)) {
    return "STATEFUL";
  }
  if (/^(?:node|deno|bun|python|python3|ruby|go|cargo|java)\s+--(?:version|help)$/.test(c)) return "PURE";
  if (
    /\b(pytest|vitest|jest|tsc|eslint|biome|ruff|mypy|cargo (test|check|clippy)|go test|go vet|git (status|diff|log)|(?:npm|pnpm|yarn|bun) (test|run (test|lint|typecheck|build)|exec)|make (test|check)|docker compose config)\b/.test(
      c,
    )
  ) {
    return "LIKELY_SAFE";
  }
  if (/\b(git status|ls|dir|cat |type )\b/.test(c)) return "READ_ONLY";
  if (/\b(echo |true|false)\b/.test(c)) return "PURE";
  return "UNKNOWN";
}

export function commandFingerprint(command: string, cwd: string, extra = ""): string {
  const normalized = command.trim().replace(/\s+/g, " ");
  return sha256(`${normalized}\n${normalize(cwd)}\n${extra}`);
}

/**
 * Decide whether a command is cheap enough to run without repository work.
 * This is intentionally conservative: only side-effect-free, shell-free
 * commands qualify, so useful diagnostics and deterministic verification still
 * use the full pipeline.
 */
export function shouldUseFastPath(command: string, config: Pick<LeanConfig, "performance">): boolean {
  if (!config.performance.fast_path) return false;
  if (/[\n\r|;&<>]/.test(command)) return false;
  return classifyCommand(command) === "PURE";
}

/** Keep cache-hit context no larger than the saved diagnostic for small results. */
export function cachedOutputMessage(_command: string, artifact: ArtifactRecord): string {
  const compressed = artifact.compressed ?? "";
  const handle = `\n\nFull output: LA://command/${artifact.id}\n`;
  // Never make a cache hit larger than the result it replaces. For larger
  // diagnostics the recovery handle is useful; for ordinary short commands,
  // returning the exact compressed result is both quieter and cheaper.
  if (Buffer.byteLength(compressed + handle) <= (artifact.fullBytes ?? Number.POSITIVE_INFINITY)) return compressed + handle;
  return compressed;
}
