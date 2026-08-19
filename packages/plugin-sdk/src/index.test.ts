import { describe, expect, it } from "vitest";
import { definePlugin, PluginRegistry } from "./index.js";

describe("plugin SDK", () => {
  it("registers a frozen plugin with an isolated collection", () => {
    const plugin = definePlugin({ id: "example", version: "1.0.0" });
    const registry = new PluginRegistry();
    registry.register(plugin);
    expect(Object.isFrozen(plugin)).toBe(true);
    expect(Object.isFrozen(plugin.rules)).toBe(true);
    expect(registry.list()).toHaveLength(1);
  });

  it("loads the package-style contributor example with adapter, rule, and filter", async () => {
    // The example is intentionally JavaScript, matching how an external package
    // would be consumed. Runtime loading is the contract under test.
    // @ts-expect-error no declaration is needed for the package-style fixture
    const module = await import("../../../examples/plugins/tidyrun-example-plugin.mjs");
    const plugin = module.default as { adapters?: unknown[]; rules?: unknown[]; filters?: unknown[] };
    expect(plugin.adapters).toHaveLength(1);
    expect(plugin.rules).toHaveLength(1);
    expect(plugin.filters).toHaveLength(1);
  });
});
