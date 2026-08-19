import type { AgentAdapter, LeanPlugin, LeanRule, OutputFilter } from "./types.js";

export class PluginRegistry {
  private readonly plugins = new Map<string, LeanPlugin>();
  private readonly rules = new Map<string, LeanRule>();
  private readonly adapters = new Map<string, AgentAdapter>();
  private readonly filters = new Map<string, OutputFilter>();

  register(plugin: LeanPlugin): void {
    if (!/^[a-z0-9][a-z0-9._-]*$/i.test(plugin.id)) throw new Error(`invalid plugin id: ${plugin.id}`);
    if (this.plugins.has(plugin.id)) throw new Error(`plugin already registered: ${plugin.id}`);
    const rules = plugin.rules ?? [];
    const adapters = plugin.adapters ?? [];
    const filters = plugin.filters ?? [];
    const seenRules = new Set<string>();
    const seenAdapters = new Set<string>();
    const seenFilters = new Set<string>();
    for (const rule of rules) if (this.rules.has(rule.id) || !seenRules.add(rule.id)) throw new Error(`rule already registered: ${rule.id}`);
    for (const adapter of adapters) if (this.adapters.has(adapter.id) || !seenAdapters.add(adapter.id)) throw new Error(`adapter already registered: ${adapter.id}`);
    for (const filter of filters) if (this.filters.has(filter.id) || !seenFilters.add(filter.id)) throw new Error(`filter already registered: ${filter.id}`);
    this.plugins.set(plugin.id, plugin);
    for (const rule of rules) this.rules.set(rule.id, rule);
    for (const adapter of adapters) this.adapters.set(adapter.id, adapter);
    for (const filter of filters) this.filters.set(filter.id, filter);
  }

  list(): LeanPlugin[] { return [...this.plugins.values()]; }
  getRules(): LeanRule[] { return [...this.rules.values()]; }
  getAdapters(): AgentAdapter[] { return [...this.adapters.values()]; }
  getFilters(): OutputFilter[] { return [...this.filters.values()]; }
}
