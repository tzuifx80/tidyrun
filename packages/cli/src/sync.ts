export const LEAN_MARK_START = "<!-- leanagent:start -->";
export const LEAN_MARK_END = "<!-- leanagent:end -->";

/** Replace only the managed LeanAgent section, preserving user-authored text. */
export function upsertBlock(existing: string, block: string): string {
  if (existing.includes(LEAN_MARK_START) && existing.includes(LEAN_MARK_END)) {
    return existing.replace(new RegExp(`${escapeRegExp(LEAN_MARK_START)}[\\s\\S]*?${escapeRegExp(LEAN_MARK_END)}`), block.trim());
  }
  return `${existing.trim()}\n\n${block.trim()}`.trim() + "\n";
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&");
}

export function upsertForTest(existing: string, block: string): string {
  return upsertBlock(existing, block);
}
