import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { homeDir } from "./config.js";
import { redactSecrets, sha256 } from "./util.js";
import type { ArtifactRecord, ArtifactStore } from "./types.js";

/** Content-addressed local artifact store. Raw output is always recoverable locally. */
export class FileArtifactStore implements ArtifactStore {
  private readonly indexPath: string;
  private readonly index = new Map<string, ArtifactRecord>();

  constructor(private readonly root = join(homeDir(), "artifacts")) {
    mkdirSync(this.root, { recursive: true, mode: 0o700 });
    this.indexPath = join(this.root, "index.json");
    this.loadIndex();
  }

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
  }): ArtifactRecord {
    const full = redactSecrets(input.full);
    const compressed = redactSecrets(input.compressed);
    const digest = sha256(`${input.kind}\0${input.command ?? ""}\0${full}`);
    const id = `la_${digest.slice(0, 16)}`;
    const dir = join(this.root, id);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const fullPath = join(dir, "full.txt");
    if (!existsSync(fullPath)) writeFileAtomic(fullPath, full);
    const record: ArtifactRecord = {
      id,
      kind: input.kind,
      sha256: sha256(full),
      command: input.command,
      cwd: input.cwd,
      ts: Date.now(),
      exit: input.exit,
      compressed,
      fullPath,
      compressedBytes: Buffer.byteLength(compressed),
      fullBytes: Buffer.byteLength(full),
      fingerprint: input.fingerprint,
      repositoryFingerprint: input.repositoryFingerprint,
      environmentFingerprint: input.environmentFingerprint,
      redacted: full !== input.full || compressed !== input.compressed,
    };
    writeFileAtomic(join(dir, "meta.json"), JSON.stringify(record, null, 2));
    this.index.set(id, record);
    this.persistIndex();
    return record;
  }

  get(id: string): ArtifactRecord | undefined {
    const normalized = normalizeId(id);
    if (!/^[a-z0-9_-]+$/i.test(normalized)) return undefined;
    const fromIndex = this.index.get(normalized);
    if (fromIndex) {
      if (isValidRecord(this.root, fromIndex)) return fromIndex;
      this.index.delete(normalized);
    }
    const meta = join(this.root, normalized, "meta.json");
    if (!existsSync(meta)) return undefined;
    try {
      const record = JSON.parse(readFileSync(meta, "utf8")) as ArtifactRecord;
      if (record.id !== normalized || !isValidRecord(this.root, record)) return undefined;
      this.index.set(normalized, record);
      return record;
    } catch {
      return undefined;
    }
  }

  readFull(id: string): string | undefined {
    const rec = this.get(id);
    if (!rec || !isWithin(this.root, rec.fullPath) || !existsSync(rec.fullPath)) return undefined;
    try {
      const full = readFileSync(rec.fullPath, "utf8");
      // A partial write or manual tamper must fail closed rather than returning
      // a misleading artifact to a coding agent.
      if (rec.sha256 && sha256(full) !== rec.sha256) return undefined;
      return full;
    } catch {
      return undefined;
    }
  }

  search(id: string, term: string): string[] {
    const full = this.readFull(id);
    if (!full) return [];
    const needle = term.toLowerCase();
    return full
      .split("\n")
      .map((line, i) => ({ line, i }))
      .filter((row) => row.line.toLowerCase().includes(needle))
      .slice(0, 100)
      .map((row) => `${row.i + 1}: ${row.line}`);
  }

  list(): ArtifactRecord[] {
    if (!existsSync(this.root)) return [];
    const rows = [...this.index.values()].filter((row) => isValidRecord(this.root, row));
    for (const id of readdirSync(this.root)) {
      if (!id.startsWith("la_")) continue;
      const row = this.get(id);
      if (row && !rows.some((item) => item.id === row.id)) rows.push(row);
    }
    return rows.sort((a, b) => b.ts - a.ts);
  }

  prune(options: { maxBytes?: number; maxArtifacts?: number; olderThanMs?: number } = {}): { removed: number; bytes: number } {
    const rows = this.list();
    const now = Date.now();
    let total = rows.reduce((sum, row) => sum + (row.fullBytes ?? 0), 0);
    let removed = 0;
    let bytes = 0;
    for (const row of [...rows].sort((a, b) => a.ts - b.ts)) {
      const old = options.olderThanMs !== undefined && now - row.ts > options.olderThanMs;
      const tooMany = options.maxArtifacts !== undefined && rows.length - removed > options.maxArtifacts;
      const tooLarge = options.maxBytes !== undefined && total > options.maxBytes;
      if (!old && !tooMany && !tooLarge) continue;
      const size = row.fullBytes ?? 0;
      try {
        rmSync(join(this.root, row.id), { recursive: true, force: true });
        this.index.delete(row.id);
        removed += 1;
        bytes += size;
        total = Math.max(0, total - size);
      } catch {
        /* A concurrent reader may have the artifact open; retain it for the next prune. */
      }
    }
    if (removed) this.persistIndex(false);
    return { removed, bytes };
  }

  private loadIndex(): void {
    if (!existsSync(this.indexPath)) return;
    try {
      const rows = JSON.parse(readFileSync(this.indexPath, "utf8")) as ArtifactRecord[];
      for (const row of rows) if (isValidRecord(this.root, row)) this.index.set(row.id, row);
    } catch {
      /* Recover from a corrupt index by discovering metadata directories lazily. */
    }
  }

  private persistIndex(mergeDisk = true): void {
    // The index is only an acceleration layer; merge on-disk rows before each
    // atomic replacement so two LeanAgent processes do not lose each other's
    // metadata. Artifact directories remain independently content-addressed.
    const merged = new Map<string, ArtifactRecord>();
    if (mergeDisk) {
      try {
        const rows = JSON.parse(readFileSync(this.indexPath, "utf8")) as ArtifactRecord[];
        for (const row of rows) if (isValidRecord(this.root, row)) merged.set(row.id, row);
      } catch { /* first writer or corrupt index */ }
    }
    for (const row of this.index.values()) if (isValidRecord(this.root, row)) merged.set(row.id, row);
    this.index.clear();
    for (const row of merged.values()) this.index.set(row.id, row);
    writeFileAtomic(this.indexPath, JSON.stringify([...merged.values()], null, 2));
  }
}

export class JsonCommandCache {
  private readonly entries = new Map<string, import("./types.js").CommandCacheEntry>();
  private readonly path: string;

  constructor(root = join(homeDir(), "cache")) {
    mkdirSync(root, { recursive: true, mode: 0o700 });
    this.path = join(root, "commands.json");
    if (existsSync(this.path)) {
      try {
        const rows = JSON.parse(readFileSync(this.path, "utf8")) as import("./types.js").CommandCacheEntry[];
        for (const row of rows) if (isValidCacheEntry(row)) this.entries.set(row.fingerprint, row);
      } catch {
        /* Treat malformed cache state as a miss; never fail a user command. */
      }
    }
  }

  get(fingerprint: string): import("./types.js").CommandCacheEntry | undefined {
    const row = this.entries.get(fingerprint);
    return row && isValidCacheEntry(row) && row.valid !== false ? row : undefined;
  }

  put(entry: import("./types.js").CommandCacheEntry): void {
    this.entries.set(entry.fingerprint, entry);
    this.persist();
  }

  list(): import("./types.js").CommandCacheEntry[] {
    return [...this.entries.values()].sort((a, b) => b.at - a.at);
  }

  invalidate(fingerprint: string, _reason: string): void {
    const row = this.entries.get(fingerprint);
    if (row) {
      row.valid = false;
      this.persist();
    }
  }

  clear(): void {
    this.entries.clear();
    this.persist(false);
  }

  private persist(mergeDisk = true): void {
    try {
      const merged = new Map<string, import("./types.js").CommandCacheEntry>();
      if (mergeDisk) {
        try {
          const rows = JSON.parse(readFileSync(this.path, "utf8")) as import("./types.js").CommandCacheEntry[];
          for (const row of rows) if (isValidCacheEntry(row)) merged.set(row.fingerprint, row);
        } catch { /* first writer or corrupt cache */ }
      }
      for (const row of this.entries.values()) if (isValidCacheEntry(row)) merged.set(row.fingerprint, row);
      this.entries.clear();
      for (const row of merged.values()) this.entries.set(row.fingerprint, row);
      writeFileAtomic(this.path, JSON.stringify([...merged.values()], null, 2));
    } catch {
      // Cache persistence is best effort; a concurrent test/session or read-only home must not break the command.
    }
  }
}

function writeFileAtomic(path: string, value: string): void {
  const tmp = `${path}.${randomUUID()}.tmp`;
  writeFileSync(tmp, value, { encoding: "utf8", mode: 0o600 });
  try {
    chmodSync(tmp, 0o600);
    renameSync(tmp, path);
  } catch {
    try {
      // Windows does not replace an existing file with renameSync. Retry with a replace.
      if (existsSync(path)) rmSync(path, { force: true });
      renameSync(tmp, path);
    } catch {
      try {
        writeFileSync(path, value, { encoding: "utf8", mode: 0o600 });
        rmSync(tmp, { force: true });
      } catch {
        try { rmSync(tmp, { force: true }); } catch { /* best effort */ }
        throw new Error(`unable to persist LeanAgent artifact: ${path}`);
      }
    }
  }
}

function normalizeId(id: string): string {
  return id.replace(/^LA:\/\/(?:command|file)\//i, "").replace(/^la:\/\//i, "");
}

function isWithin(root: string, candidate: string): boolean {
  const rel = relative(resolve(root), resolve(candidate));
  return rel === "" || (!rel.startsWith("..") && !rel.includes(":\\"));
}

function isValidRecord(root: string, record: ArtifactRecord | undefined): record is ArtifactRecord {
  if (!record || typeof record.id !== "string" || !/^[a-z0-9_-]+$/i.test(record.id)) return false;
  if (typeof record.fullPath !== "string" || !isWithin(root, record.fullPath)) return false;
  return resolve(record.fullPath) === resolve(join(root, record.id, "full.txt")) && existsSync(record.fullPath);
}

function isValidCacheEntry(row: import("./types.js").CommandCacheEntry | undefined): row is import("./types.js").CommandCacheEntry {
  return Boolean(row && typeof row.fingerprint === "string" && typeof row.command === "string" && typeof row.artifactId === "string" && typeof row.class === "string" && typeof row.exit === "number" && row.dependencies && typeof row.dependencies === "object");
}

export function newSessionId(): string {
  return randomUUID();
}
