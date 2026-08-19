import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { homeDir } from "./config.js";
import { sha256 } from "./util.js";

export interface WorkArtifact<T = unknown> {
  id: string;
  type: string;
  dependencies: Record<string, string>;
  payload: T;
  createdAt: number;
  toolVersion: string;
}

/** Dependency-aware deterministic cache for repository maps, test impact and verified work. */
export class WorkCache {
  private readonly entries = new Map<string, WorkArtifact>();
  private readonly path: string;

  constructor(root = join(homeDir(), "cache")) {
    mkdirSync(root, { recursive: true, mode: 0o700 });
    this.path = join(root, "work.json");
    if (existsSync(this.path)) {
      try { for (const row of JSON.parse(readFileSync(this.path, "utf8")) as WorkArtifact[]) if (validRow(row)) this.entries.set(row.id, row); } catch { /* miss */ }
    }
  }

  put<T>(input: Omit<WorkArtifact<T>, "createdAt" | "toolVersion"> & { toolVersion?: string }): WorkArtifact<T> {
    const row: WorkArtifact<T> = { ...input, createdAt: Date.now(), toolVersion: input.toolVersion ?? "leanagent/0.1" };
    this.entries.set(row.id, row as WorkArtifact);
    this.persist();
    return row;
  }

  get<T>(id: string, currentDependencies: Record<string, string>): WorkArtifact<T> | undefined {
    const row = this.entries.get(id);
    if (!row || !dependenciesMatch(row.dependencies, currentDependencies)) return undefined;
    return row as WorkArtifact<T>;
  }

  invalidateByPath(path: string): string[] {
    const ids: string[] = [];
    for (const [id, row] of this.entries) if (Object.prototype.hasOwnProperty.call(row.dependencies, path)) { this.entries.delete(id); ids.push(id); }
    if (ids.length) this.persist();
    return ids;
  }

  list(): WorkArtifact[] { return [...this.entries.values()].sort((a, b) => b.createdAt - a.createdAt); }
  clear(): void { this.entries.clear(); this.persist(false); }

  private persist(mergeDisk = true): void {
    const merged = new Map<string, WorkArtifact>();
    if (mergeDisk) {
      try {
        const rows = JSON.parse(readFileSync(this.path, "utf8")) as WorkArtifact[];
        for (const row of rows) if (validRow(row)) merged.set(row.id, row);
      } catch { /* first writer or corrupt cache */ }
    }
    for (const row of this.entries.values()) if (validRow(row)) merged.set(row.id, row);
    this.entries.clear();
    for (const row of merged.values()) this.entries.set(row.id, row);
    const tmp = `${this.path}.${randomUUID()}.tmp`;
    try {
      writeFileSync(tmp, JSON.stringify([...merged.values()], null, 2), { encoding: "utf8", mode: 0o600 });
      renameSync(tmp, this.path);
    } catch {
      try { writeFileSync(this.path, JSON.stringify([...merged.values()], null, 2), { encoding: "utf8", mode: 0o600 }); } finally { try { rmSync(tmp, { force: true }); } catch { /* best effort */ } }
    }
  }
}

function validRow(row: WorkArtifact | undefined): row is WorkArtifact {
  return Boolean(row && typeof row.id === "string" && typeof row.type === "string" && row.dependencies && typeof row.dependencies === "object");
}

function dependenciesMatch(expected: Record<string, string>, current: Record<string, string>): boolean {
  return Object.entries(expected).every(([path, hash]) => current[path] === hash);
}

export function dependencyFingerprint(dependencies: Record<string, string>): string { return sha256(JSON.stringify(Object.entries(dependencies).sort(([a], [b]) => a.localeCompare(b)))); }
