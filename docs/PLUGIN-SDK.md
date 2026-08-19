# Plugin SDK

Create a package that exports a plugin definition:

```ts
import { definePlugin } from "@leanagent/plugin-sdk";

export default definePlugin({
  id: "filter-my-runner",
  version: "1.0.0",
  filters: [{
    id: "my-runner",
    matches: (command) => command.startsWith("my-test"),
    compress: (_command, output, maxChars) => output.slice(0, maxChars),
  }],
});
```

Plugins are trusted in-process code. Register them explicitly in a host integration; LeanAgent does not auto-download or execute arbitrary packages.

The complete package-style example (adapter + rule + filter) lives at
`examples/plugins/leanagent-example-plugin.mjs` and is loaded in the SDK test.
The stable surface is the `LeanPlugin` shape: `id`, `version`, and optional
`rules`, `adapters`, and `filters`. Adapter capabilities are declarative; a
plugin must not claim interception that its host does not provide.
