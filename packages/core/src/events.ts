import type { LeanEvent, LeanEventBus, LeanEventType } from "./types.js";

export class EventBus implements LeanEventBus {
  private readonly listeners = new Map<LeanEventType | "*", Set<(event: LeanEvent) => void>>();

  emit(event: LeanEvent): void {
    for (const listener of this.listeners.get(event.type) ?? []) {
      try { listener(event); } catch { /* observers must never break the operation */ }
    }
    for (const listener of this.listeners.get("*") ?? []) {
      try { listener(event); } catch { /* observers must never break the operation */ }
    }
  }

  on(type: LeanEventType | "*", listener: (event: LeanEvent) => void): () => void {
    const set = this.listeners.get(type) ?? new Set<(event: LeanEvent) => void>();
    set.add(listener);
    this.listeners.set(type, set);
    return () => set.delete(listener);
  }
}
