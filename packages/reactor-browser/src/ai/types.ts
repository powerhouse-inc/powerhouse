import type {
  PhAiToolAnnotations,
  PhAiToolDescriptor,
} from "@powerhousedao/shared/document-model";

/**
 * Browser-side AI chat over the reactor.
 *
 * The chat agent is tool-agnostic: consumers (e.g. Connect) pass a lazy
 * provider of {@link AiToolDescriptor}s. The descriptors mirror the
 * provider-agnostic tool core in `@powerhousedao/reactor-mcp/tools`, so the
 * same tool definitions drive both the MCP server and the in-browser chat.
 */

/** User-configured LLM connection settings, persisted in localStorage. */
export interface AiSettings {
  /** Master on/off for the in-browser assistant. Off by default. */
  enabled: boolean;
  /** OpenAI-compatible base URL, e.g. `https://api.openai.com/v1` */
  baseUrl: string;
  /** API key. Sent only to the configured endpoint, never to Powerhouse. */
  apiKey: string;
  /** Model id the endpoint serves, e.g. `gpt-4o-mini`. */
  model: string;
  /**
   * When false (default), write tools render an approval card and pause the
   * agent loop until the user approves or rejects the action.
   */
  autoApproveWrites: boolean;
}

/** MCP-compatible annotation hints; structural, no MCP SDK dependency. */
export type AiToolAnnotations = PhAiToolAnnotations;

/**
 * Provider-agnostic tool descriptor accepted by the chat agent.
 *
 * Structurally compatible with the MCP tool records produced by
 * `createReactorMcpProvider`: the callback parameter is `never` so any
 * per-tool-args function type is assignable, and the result is `unknown`
 * because the envelope shape (MCP `CallToolResult`) is unwrapped at the
 * adapter boundary.
 */
export type AiToolDescriptor = PhAiToolDescriptor;

/** Tool descriptors the app resolves when the user sends a message. */
export type AiToolsProvider = () => Promise<AiToolDescriptor[]>;

/** Tool names whose execution mutates the reactor and requires approval. */
export const WRITE_TOOLS: ReadonlySet<string> = new Set([
  "createDocument",
  "addActions",
  "deleteDocument",
  "addDrive",
  "deleteDrive",
  "addRemoteDrive",
]);

/**
 * Whether executing the tool mutates state and requires user approval:
 * the built-in write tools, or any tool flagged destructive in its
 * annotations (covers package-provided tools outside the built-in set).
 */
export function isWriteTool(
  name: string,
  annotations?: AiToolAnnotations,
): boolean {
  return WRITE_TOOLS.has(name) || annotations?.destructiveHint === true;
}

export type ToolCallState =
  | "awaiting-approval"
  | "executing"
  | "done"
  | "error"
  | "rejected";

/** One rendered unit inside a chat message. */
export type ChatPart =
  | { type: "text"; text: string }
  | {
      type: "tool";
      toolCallId: string;
      name: string;
      args: unknown;
      state: ToolCallState;
      result?: unknown;
      error?: string;
    };

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  parts: ChatPart[];
}

/** A write tool call the user must approve or reject. */
export interface PendingApproval {
  toolCallId: string;
  name: string;
  args: unknown;
}

/** Context snapshot injected into the agent system prompt. */
export interface ChatContext {
  driveId?: string;
  driveName?: string;
  nodeId?: string;
  nodeName?: string;
  nodeKind?: "file" | "folder";
  documentType?: string;
  documentName?: string;
  documentId?: string;
  switchboardUrl?: string;
  switchboardGraphqlUrl?: string;
}

/** Events the agent emits while running a turn. */
export type AgentEvent =
  | { type: "text-delta"; delta: string }
  | {
      type: "tool-start";
      toolCallId: string;
      name: string;
      args: unknown;
    }
  | {
      type: "approval-request";
      toolCallId: string;
      name: string;
      args: unknown;
    }
  | { type: "approval-resolved"; toolCallId: string; approved: boolean }
  | {
      type: "tool-result";
      toolCallId: string;
      name: string;
      state: "done" | "error" | "rejected";
      result?: unknown;
      error?: string;
    }
  | { type: "finish" }
  | { type: "error"; error: string };
