/** Stable, dependency-light extension surface for TidyRun plugins. */
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
} from "@tidyrun/core";

export function definePlugin(plugin: import("@tidyrun/core").LeanPlugin): import("@tidyrun/core").LeanPlugin {
  return Object.freeze({
    ...plugin,
    rules: Object.freeze([...(plugin.rules ?? [])]),
    adapters: Object.freeze([...(plugin.adapters ?? [])]),
    filters: Object.freeze([...(plugin.filters ?? [])]),
  });
}
