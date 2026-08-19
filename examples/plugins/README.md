# Example external plugin

`leanagent-example-plugin.mjs` is intentionally package-shaped: it imports the
public `@leanagent/plugin-sdk`, exports a frozen default plugin, and demonstrates
one adapter, one rule, and one output filter. A host can load it with a normal
dynamic import and register the value explicitly:

```js
const { default: plugin } = await import("./leanagent-example-plugin.mjs");
const agent = await createLeanAgent({ repository, plugins: [plugin] });
```

Plugins are trusted in-process code. LeanAgent never discovers, downloads, or
executes arbitrary packages automatically.
