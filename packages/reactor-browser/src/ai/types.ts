import type {
  PhAiChatImage,
  PhAiToolAnnotations,
  PhAiToolContext,
  PhAiToolDescriptor,
} from "@powerhousedao/shared/document-model";
import type { ReactorBrowserHalves } from "../types/reactor-browser-client.js";
import type { SwitchboardDirectory } from "../types/switchboards.js";

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

/**
 * An endpoint the host app picked for the chat, which takes the place of the
 * user's settings. It holds no API key: the endpoint holds its own (see
 * `gatewayConnection`), and write tools always ask for approval.
 */
export interface AiConnection {
  /** OpenAI-compatible base URL; a relative path resolves against the page. */
  baseUrl: string;
  /** Model id, sent as is. A gateway may answer with its own. */
  model: string;
  /** Sets each request's credentials, e.g. the user's bearer. */
  fetch?: typeof fetch;
}

/** An image attached to a user message. */
export interface ChatImage {
  /** `data:<mediaType>;base64,...` */
  dataUrl: string;
  mediaType: string;
  name?: string;
}

/** A sent image, under the handle tools reach it by. */
export type AiChatImage = PhAiChatImage;

/** MCP-compatible annotation hints; structural, no MCP SDK dependency. */
export type AiToolAnnotations = PhAiToolAnnotations;

/**
 * Provider-agnostic tool descriptor accepted by the chat agent.
 *
 * Structurally compatible with the MCP tool records produced by
 * `toMcpTool`: the callback parameter is `never` so any
 * per-tool-args function type is assignable, and the result is `unknown`
 * because the envelope shape (MCP `CallToolResult`) is unwrapped at the
 * adapter boundary.
 */
export type AiToolDescriptor = PhAiToolDescriptor;

/** Tool descriptors the app resolves when the user sends a message. */
export type AiToolsProvider = () => Promise<AiToolDescriptor[]>;

/** The host's services a tool may use, handed over on each call. */
export interface AiToolServices {
  /** The switchboards the host reaches; pass it to `resolveSwitchboard`. */
  switchboards?: SwitchboardDirectory;
  /** The host's reactor client, read and write halves. */
  reactor?: ReactorBrowserHalves;
}

/**
 * What the agent passes a tool next to its arguments: the turn's signal and
 * images, and the host's services. A tool reads what it needs from here, not
 * from a global.
 */
export type AiToolContext = PhAiToolContext & AiToolServices;

/** Whether running the tool needs approval: anything not annotated read-only. */
export function isWriteTool(annotations?: AiToolAnnotations): boolean {
  return annotations?.readOnlyHint !== true;
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
  | { type: "image"; dataUrl: string; name?: string }
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
  /** The switchboards the host reaches; absent when it gives no directory. */
  switchboards?: {
    name: string;
    url: string;
    workflows: boolean | "unknown";
  }[];
  /** The selected drive's synced switchboard, for a host with no directory. */
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
  /**
   * Token accounting for the turn: the input tokens of the model's last
   * step (i.e. the size of the context it was reasoning over).
   */
  | { type: "usage"; inputTokens: number }
  | { type: "finish" }
  | { type: "error"; error: string };
