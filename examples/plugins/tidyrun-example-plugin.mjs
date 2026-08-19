import { definePlugin } from "@tidyrun/plugin-sdk";

// A package-style example: import this module from a host and pass the default
// export to createLeanAgent({ plugins: [plugin] }). It intentionally stays small
// so a contributor can understand the stable extension boundary in one screen.
export default definePlugin({
  id: "example-contributor-plugin",
  version: "1.0.0",
  adapters: [{
    id: "example-agent",
    name: "Example agent",
    mode: "rules",
    capabilities: {
      observeFileReads: false,
      interceptFileReads: false,
      observeCommands: true,
      interceptCommands: false,
      observeModelUsage: false,
      injectContext: true,
      structuredFeedback: true,
      sessionLifecycle: false,
    },
    detect: (repository) => repository.includes("example"),
    describe: () => "Example adapter with explicit, non-intercepting capabilities.",
  }],
  rules: [{
    id: "example-command-note",
    description: "Annotate a completed command without changing execution.",
    events: ["command.completed"],
    evaluate: async () => ({
      ruleId: "example-command-note",
      kind: "warn",
      reason: "Example plugin rule evaluated.",
      evidence: ["external package-style plugin"],
      fallback: "continue original operation",
      confidence: 1,
      message: "Example plugin observed the command; execution was unchanged.",
    }),
  }],
  filters: [{
    id: "example-filter",
    matches: (command) => command.startsWith("example-test"),
    compress: (_command, output, maxChars) => output.length <= maxChars ? output : `${output.slice(0, Math.max(0, maxChars - 32))}\n… example artifact available`,
  }],
});
