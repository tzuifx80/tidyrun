# Supported agents and capability levels

LeanAgent reports the capability level it can legitimately provide. A rules file is not an interception hook; the distinction is intentional.

| Agent | Level | Current integration | Limitation |
|---|---|---|---|
| Generic shell agents | FULL | `leanagent run -- <command>` captures commands, output, artifacts, metrics | Agent file reads are visible only when the agent uses the wrapper/API |
| Gemini CLI | PARTIAL | `leanagent hook gemini` handles documented JSON `BeforeTool`, `AfterTool`, and `SessionStart` hooks; `GEMINI.md` sync | Only exposed hook tool payloads are observable; file reads and model usage are not universally exposed |
| Codex | PARTIAL | `AGENTS.md` sync and generic wrapper | No provider-specific interception is assumed in the core |
| Claude Code | PARTIAL | `CLAUDE.md` sync, `leanagent mcp`, and generic wrapper | MCP exposes structured tools/context, not transparent interception of every terminal operation |
| OpenCode | FALLBACK | repository detection and `leanagent mcp` | Plugin API is host-version dependent |
| Cursor / Windsurf | FALLBACK | managed rules and terminal wrapper | Editor terminal interception is not consistently exposed |
| Cline / Roo Code | FALLBACK | managed rules and MCP server | Extension host controls tool interception |
| Aider | FALLBACK | `leanagent run` and repository rules | No universal native event stream |

The adapter catalog is inspectable with `leanagent adapters --json`. LeanAgent does not claim model-token savings unless provider usage metadata is actually delivered.

### Capability matrix

| Provider | Session lifecycle | Observe tool calls | Intercept tool calls | Modify tool output | Inject feedback | Usage metrics | MCP | Rules | Shell fallback |
|---|---|---|---|---|---|---|---|---|---|
| Generic shell | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | SUPPORTED |
| Gemini CLI | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | UNAVAILABLE | UNAVAILABLE | SUPPORTED | SUPPORTED |
| Codex | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | PARTIAL | UNAVAILABLE | UNAVAILABLE | SUPPORTED | SUPPORTED |
| Claude Code | PARTIAL | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | SUPPORTED | UNAVAILABLE | SUPPORTED | SUPPORTED | SUPPORTED |
| OpenCode | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | PARTIAL | UNAVAILABLE | PARTIAL | SUPPORTED | SUPPORTED |
| Cursor / Windsurf | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | PARTIAL | UNAVAILABLE | UNAVAILABLE | SUPPORTED | SUPPORTED |
| Cline / Roo Code | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | PARTIAL | UNAVAILABLE | PARTIAL | SUPPORTED | SUPPORTED |
| Aider | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | PARTIAL | UNAVAILABLE | UNAVAILABLE | SUPPORTED | SUPPORTED |

`SUPPORTED` means the current adapter exposes that capability directly;
`PARTIAL` means only a documented host surface is covered; `FALLBACK` is the
wrapper/rules path rather than transparent interception; `UNAVAILABLE` is not
claimed.

## Official hook references

- [Gemini CLI hooks reference](https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/reference.md)
- [Gemini CLI MCP server configuration](https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md)
- [Claude Code MCP overview](https://docs.anthropic.com/en/docs/mcp)

Provider APIs change. Re-run the capability matrix when upgrading an agent.
