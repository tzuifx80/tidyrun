import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";
import type { ArtifactStore } from "./types.js";
import { FileArtifactStore } from "./store.js";
import { indexRepository, snapshotRepository, affectedTests } from "./repo.js";

export interface McpServerOptions { repository: string; store?: ArtifactStore; input?: Readable; output?: Writable }

/** Small dependency-free MCP stdio server for artifact and repository inspection. */
export class LeanMcpServer {
  private readonly store: ArtifactStore;
  constructor(private readonly options: McpServerOptions) { this.store = options.store ?? new FileArtifactStore(); }

  async handle(request: Record<string, unknown>): Promise<Record<string, unknown>> {
    const id = request.id ?? null;
    const method = String(request.method ?? "");
    if (method === "initialize") return { jsonrpc: "2.0", id, result: { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "tidyrun", version: "0.1.0" } } };
    if (method === "notifications/initialized") return { jsonrpc: "2.0", id, result: {} };
    if (method === "tools/list") return { jsonrpc: "2.0", id, result: { tools: toolDefinitions() } };
    if (method === "resources/list") return { jsonrpc: "2.0", id, result: { resources: [{ uri: "tidyrun://repository/state", name: "Repository state", mimeType: "application/json" }, { uri: "tidyrun://session/stats", name: "Latest session stats", mimeType: "application/json" }] } };
    if (method === "resources/read") {
      const uri = String(((request.params ?? {}) as { uri?: string }).uri ?? "");
      if (uri === "tidyrun://repository/state") return { jsonrpc: "2.0", id, result: { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(snapshotRepository(this.options.repository), null, 2) }] } };
      if (uri === "tidyrun://session/stats") {
        const row = this.store.list().find((item) => item.kind === "session-metrics");
        return { jsonrpc: "2.0", id, result: { contents: [{ uri, mimeType: "application/json", text: row ? this.store.readFull(row.id) ?? "{}" : "{}" }] } };
      }
      return { jsonrpc: "2.0", id, error: { code: -32001, message: `unknown resource ${uri}` } };
    }
    if (method === "tools/call") {
      const params = (request.params ?? {}) as { name?: string; arguments?: Record<string, unknown> };
      return { jsonrpc: "2.0", id, result: await this.callTool(params.name ?? "", params.arguments ?? {}) };
    }
    return { jsonrpc: "2.0", id, error: { code: -32601, message: `method not found: ${method}` } };
  }

  async serve(): Promise<void> {
    const input = this.options.input ?? process.stdin;
    const output = this.options.output ?? process.stdout;
    const rl = createInterface({ input });
    for await (const line of rl) {
      try { output.write(`${JSON.stringify(await this.handle(JSON.parse(String(line))))}\n`); }
      catch (error) { output.write(`${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: error instanceof Error ? error.message : String(error) } })}\n`); }
    }
  }

  private async callTool(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (name === "tidyrun_get_artifact") {
      const id = String(args.id ?? "");
      const record = this.store.get(id);
      return { content: [{ type: "text", text: record ? JSON.stringify(record, null, 2) : `unknown artifact ${id}` }], isError: !record };
    }
    if (name === "tidyrun_search_artifact") {
      const hits = this.store.search(String(args.id ?? ""), String(args.term ?? ""));
      return { content: [{ type: "text", text: hits.join("\n") }] };
    }
    if (name === "tidyrun_repository_state") return { content: [{ type: "text", text: JSON.stringify(snapshotRepository(this.options.repository), null, 2) }] };
    if (name === "tidyrun_affected_tests") {
      const index = indexRepository(this.options.repository);
      const changed = Array.isArray(args.changed) ? args.changed.map(String) : [];
      return { content: [{ type: "text", text: JSON.stringify(affectedTests(index, changed), null, 2) }] };
    }
    if (name === "tidyrun_session_stats") {
      const rows = this.store.list().filter((row) => row.kind === "session-metrics").slice(0, 1);
      return { content: [{ type: "text", text: rows[0] ? (this.store.readFull(rows[0].id) ?? "") : "No completed sessions recorded." }] };
    }
    return { content: [{ type: "text", text: `unknown tool ${name}` }], isError: true };
  }
}

function toolDefinitions(): Array<Record<string, unknown>> {
  return [
    { name: "tidyrun_get_artifact", description: "Get artifact metadata by id.", inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
    { name: "tidyrun_search_artifact", description: "Search stored raw artifact lines.", inputSchema: { type: "object", properties: { id: { type: "string" }, term: { type: "string" } }, required: ["id", "term"] } },
    { name: "tidyrun_repository_state", description: "Return a conservative local repository fingerprint.", inputSchema: { type: "object", properties: {} } },
    { name: "tidyrun_affected_tests", description: "Select tests for changed files using the local repository index.", inputSchema: { type: "object", properties: { changed: { type: "array", items: { type: "string" } } }, required: ["changed"] } },
    { name: "tidyrun_session_stats", description: "Return the most recent completed local session metrics.", inputSchema: { type: "object", properties: {} } },
  ];
}
