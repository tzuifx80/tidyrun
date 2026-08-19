import { createLeanAgent } from "./engine.js";
import { compressOutput } from "./compress.js";
import { redactSecrets } from "./util.js";

export interface GeminiHookInput {
  cwd?: string;
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_response?: { llmContent?: unknown; returnDisplay?: unknown; error?: unknown };
  prompt?: string;
}

/** Handle the documented Gemini CLI JSON hook contract without printing non-JSON stdout. */
export async function handleGeminiHook(input: GeminiHookInput): Promise<Record<string, unknown>> {
  const cwd = input.cwd || process.cwd();
  const lean = await createLeanAgent({ repository: cwd });
  try {
    const event = input.hook_event_name ?? "";
    if (event === "BeforeTool" && input.tool_name === "run_shell_command") {
      const command = String(input.tool_input?.command ?? input.tool_input?.cmd ?? "");
      if (command) {
        const decisions = await lean.prepareCommand(command);
        const block = decisions.find((decision) => decision.kind === "reuse");
        if (block?.message) return { decision: "deny", reason: block.message, systemMessage: "LeanAgent reused a verified command result." };
        const warning = decisions.find((decision) => decision.kind === "warn");
        if (warning?.message) return { systemMessage: warning.message };
      }
    }
    if (event === "AfterTool" && input.tool_name === "run_shell_command") {
      const raw = typeof input.tool_response?.llmContent === "string" ? input.tool_response.llmContent : "";
      if (raw) {
        const compressed = compressOutput(String(input.tool_input?.command ?? "shell"), redactSecrets(raw), lean.config.context.max_tool_output_chars);
        if (compressed !== raw) return { hookSpecificOutput: { additionalContext: `LeanAgent compressed command output.\n\n${compressed}` }, systemMessage: `LeanAgent compressed ${raw.length} → ${compressed.length} characters.` };
      }
    }
    if (event === "SessionStart") return { hookSpecificOutput: { additionalContext: "LeanAgent is active: use targeted reads, avoid repeating verified commands, and retrieve LA:// artifacts only when needed." } };
    return {};
  } finally {
    lean.finish();
  }
}
