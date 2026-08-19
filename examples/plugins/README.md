# Example external plugin

`tidyrun-example-plugin.mjs` is intentionally package-shaped: it imports the
public `@tidyrun/plugin-sdk`, exports a frozen default plugin, and demonstrates
one adapter, one rule, and one output filter. A host can load it with a normal
dynamic import and register the value explicitly:

```js
const { default: plugin } = await import("./tidyrun-example-plugin.mjs");
const agent = await createTidyRun({ repository, plugins: [plugin] });
```

Plugins are trusted in-process code. TidyRun never discovers, downloads, or
executes arbitrary packages automatically.
