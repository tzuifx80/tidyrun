import { existsSync } from "node:fs";
import { join } from "node:path";
import type { AgentAdapter } from "./types.js";

const rules = {
  observeFileReads: false,
  interceptFileReads: false,
  observeCommands: false,
  interceptCommands: false,
  observeModelUsage: false,
  injectContext: false,
  structuredFeedback: false,
  sessionLifecycle: false,
};

export const genericAdapter: AgentAdapter = {
  id: "generic",
  name: "Generic shell adapter",
  mode: "wrapper",
  capabilities: { ...rules, observeCommands: true, interceptCommands: true, structuredFeedback: true, sessionLifecycle: true },
  detect: () => true,
  describe: () => "Use tidyrun run -- <command>; captures stdout/stderr, compresses output, and persists artifacts.",
};

function rulesAdapter(id: string, name: string, files: string[], notes: string): AgentAdapter {
  return {
    id, name, mode: "rules", capabilities: { ...rules, injectContext: true },
    detect: (repository) => files.some((file) => existsSync(join(repository, file))),
    install: async () => ({ files, notes: [notes] }),
    describe: () => notes,
  };
}

export const agentAdapters: AgentAdapter[] = [
  rulesAdapter("codex", "OpenAI Codex", ["AGENTS.md"], "Rules synchronization is supported. Native tool interception depends on the Codex host and is not assumed; use the generic wrapper for command interception."),
  {
    id: "claude", name: "Claude Code", mode: "mcp",
    capabilities: { ...rules, injectContext: true, structuredFeedback: true, sessionLifecycle: true },
    detect: (repository) => existsSync(join(repository, "CLAUDE.md")),
    install: async () => ({ files: ["CLAUDE.md"], notes: ["Claude Code supports MCP servers. Add `tidyrun mcp` through the documented Claude MCP configuration; terminal interception still uses the generic wrapper."] }),
    describe: () => "MCP plus managed CLAUDE.md rules; no unsupported native command interception is claimed.",
  },
  {
    id: "gemini", name: "Gemini CLI", mode: "hook",
    capabilities: { ...rules, observeCommands: true, interceptCommands: true, injectContext: true, structuredFeedback: true, sessionLifecycle: true },
    detect: (repository) => existsSync(join(repository, "GEMINI.md")) || existsSync(join(repository, ".gemini")),
    install: async () => ({ files: ["GEMINI.md"], notes: ["Gemini CLI exposes JSON stdin/stdout hooks. Configure BeforeTool/AfterTool/SessionStart to invoke `tidyrun hook gemini`; command interception is limited to tool payloads exposed by the hook contract."] }),
    describe: () => "Native JSON hook handler for Gemini CLI BeforeTool, AfterTool, and SessionStart events; configure it in settings.json.",
  },
  rulesAdapter("opencode", "OpenCode", ["opencode.json", "opencode.jsonc"], "Repository detection and MCP fallback are supported; plugin hooks are host-version dependent."),
  rulesAdapter("cursor", "Cursor", [".cursor", ".cursorrules"], "Rules synchronization is supported; terminal interception is not exposed consistently, so use the wrapper."),
  rulesAdapter("windsurf", "Windsurf", [".windsurf"], "Rules synchronization is supported; use the wrapper where terminal hooks are unavailable."),
  rulesAdapter("cline", "Cline", [".clinerules"], "Rules synchronization is supported; MCP is the legitimate structured integration path."),
  rulesAdapter("roo", "Roo Code", [".roomodes", ".roo"], "Rules synchronization is supported; MCP is the legitimate structured integration path."),
  rulesAdapter("aider", "Aider", [".aider.conf.yml", ".aider.model.settings.yml"], "Configuration detection is supported; use tidyrun run for command interception."),
  genericAdapter,
];

export function detectAdapters(repository: string): AgentAdapter[] {
  return agentAdapters.filter((adapter) => adapter.id === "generic" || adapter.detect(repository));
}
