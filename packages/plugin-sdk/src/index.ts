/** Stable, dependency-light extension surface for LeanAgent plugins. */
export {
  PluginRegistry,
  type AgentAdapter,
  type AgentCapabilities,
  type LeanPlugin,
  type LeanRule,
  type OutputFilter,
  type LeanEvent,
  type LeanEventType,
  type LeanDecision,
  type RuleContext,
} from "@leanagent/core";

export function definePlugin(plugin: import("@leanagent/core").LeanPlugin): import("@leanagent/core").LeanPlugin {
  return Object.freeze({
    ...plugin,
    rules: Object.freeze([...(plugin.rules ?? [])]),
    adapters: Object.freeze([...(plugin.adapters ?? [])]),
    filters: Object.freeze([...(plugin.filters ?? [])]),
  });
}
