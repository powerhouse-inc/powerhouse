import {
  type LanguageModel,
  type ModelMessage,
  type Tool,
  isStepCount,
  streamText,
  tool,
} from "ai";
import { toResponseMessages } from "ai/internal";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { z } from "zod";
import { isWriteTool } from "./types.js";
import type {
  AgentEvent,
  AiSettings,
  AiToolDescriptor,
  ChatContext,
} from "./types.js";

/** Hard cap on model round-trips per user message (each tool step counts). */
export const MAX_AGENT_STEPS = 10;

/**
 * Creates the chat language model for a user-supplied OpenAI-compatible
 * endpoint. Requests go directly from the browser to the endpoint; the API
 * key is never sent to any Powerhouse server.
 */

/**
 * Resolves the configured base URL. Relative paths (e.g. `/v1`) resolve
 * against the page origin, so single-origin deployments can serve the
 * endpoint behind the same reverse proxy without CORS.
 */
function resolveBaseUrl(raw: string): string {
  const base = raw.trim().replace(/\/+$/, "");
  if (/^https?:\/\//i.test(base)) return base;
  if (typeof window === "undefined") return base;
  return `${window.location.origin}${base.startsWith("/") ? "" : "/"}${base}`;
}

export function createReactorChatModel(settings: AiSettings): LanguageModel {
  const provider = createOpenAICompatible({
    name: "reactor-chat",
    baseURL: resolveBaseUrl(settings.baseUrl),
    apiKey: settings.apiKey,
  });
  return provider.chatModel(settings.model.trim());
}

/**
 * Unwraps the MCP `CallToolResult` envelope produced by the reactor tool
 * core into a plain value for the AI SDK. Throws for error results so the
 * SDK surfaces them as tool errors in the next model step.
 */
export function unwrapToolResult(raw: unknown): unknown {
  if (raw && typeof raw === "object") {
    const envelope = raw as {
      isError?: boolean;
      content?: Array<{ type?: string; text?: string }>;
      structuredContent?: unknown;
    };
    if (
      typeof envelope.isError === "boolean" ||
      Array.isArray(envelope.content)
    ) {
      if (envelope.isError) {
        const text =
          envelope.content?.find((c) => c.type === "text")?.text ??
          "Unknown tool error";
        throw new Error(text.replace(/^Error:\s*/, ""));
      }
      if (envelope.structuredContent !== undefined) {
        return envelope.structuredContent;
      }
      const textPart = envelope.content?.find((c) => c.type === "text");
      if (textPart?.text !== undefined) {
        try {
          return JSON.parse(textPart.text);
        } catch {
          return textPart.text;
        }
      }
      return null;
    }
  }
  return raw;
}

/** Builds the system prompt, grounding the agent in the current selection. */
export function buildSystemPrompt(context: ChatContext): string {
  const lines: string[] = [
    "You are an assistant embedded in the Powerhouse Connect drive explorer.",
    "You operate on a local-first document store (the reactor) exclusively through the provided tools.",
    "Documents are instances of typed document models; drives are collections that group documents and folders.",
    "Prefer read-only tools to discover state (document models, drives, documents, relationships) before making changes.",
    "Never invent document ids, drive ids, folder ids or document model types — discover them with the read tools first.",
    "Never accept secret values (passwords, tokens, API keys) in chat. When a connection or configuration requires a secret, tell the user to enter it in the relevant editor (e.g. the connection editor) and point them to the document. Never ask the user to paste a secret into the chat.",
    "When the user refers to 'this', 'here' or 'it' without naming a target, they mean the current selection below; prefer it for create/modify targets.",
  ];
  const selection: string[] = [];
  if (context.driveName) {
    selection.push(
      `The current drive is "${context.driveName}"` +
        (context.driveId ? ` (id: ${context.driveId})` : "") +
        ".",
    );
  }
  if (context.nodeKind === "folder" && context.nodeName) {
    selection.push(`The current folder is "${context.nodeName}".`);
  }
  if (context.documentType) {
    selection.push(
      `The current document is "${context.documentName ?? "unnamed"}" of type "${context.documentType}"` +
        (context.documentId ? ` (id: ${context.documentId})` : "") +
        ".",
    );
  }
  if (context.switchboardUrl) {
    selection.push(
      `The switchboard for this drive is at ${context.switchboardUrl}; its GraphQL endpoint is ${context.switchboardGraphqlUrl ?? ""}. Use the getSwitchboardSchema tool to list the queries and mutations it exposes.`,
    );
  } else if (context.driveId) {
    selection.push(
      "This drive is not synced to a switchboard, so no switchboard endpoints are available for it.",
    );
  }
  if (selection.length > 0) {
    lines.push("Current selection:", ...selection.map((s) => `- ${s}`));
  } else {
    lines.push(
      "Nothing is currently selected. When the target of an action is ambiguous, ask the user which drive, folder or document it should apply to.",
    );
  }
  return lines.join("\n");
}

export interface ReactorChatAgentOptions {
  settings: AiSettings;
  tools: AiToolDescriptor[];
  context: ChatContext;
  onEvent: (event: AgentEvent) => void;
  signal?: AbortSignal;
  /** Test seam: override the model (e.g. a mock language model). */
  model?: LanguageModel;
  /** Prior conversation to continue (see {@link ReactorChatAgent.getHistory}). */
  history?: ModelMessage[];
}

/**
 * Runs one tool-loop conversation turn against an OpenAI-compatible model.
 *
 * The agent keeps the model message history across turns. Write tools are
 * gated by the AI SDK's tool approval: when auto-approval is off, the
 * pending user decision is bridged through {@link approve}/{@link reject}.
 */
export class ReactorChatAgent {
  private history: ModelMessage[];
  private approvals = new Map<string, (approved: boolean) => void>();

  constructor(private readonly options: ReactorChatAgentOptions) {
    this.history = options.history ?? [];
  }

  /** The model history after the last completed turn, for the next agent. */
  getHistory(): ModelMessage[] {
    return this.history;
  }

  /** Clears the conversation history (a fresh chat). */
  reset(): void {
    this.history = [];
    this.cancelPendingApprovals();
  }

  /** Approves a pending write tool call, resuming the agent loop. */
  approve(toolCallId: string): void {
    this.resolveApproval(toolCallId, true);
  }

  /** Rejects a pending write tool call; the rejection is fed to the model. */
  reject(toolCallId: string): void {
    this.resolveApproval(toolCallId, false);
  }

  private resolveApproval(toolCallId: string, approved: boolean): void {
    const resolve = this.approvals.get(toolCallId);
    if (resolve) {
      this.approvals.delete(toolCallId);
      resolve(approved);
    }
  }

  private cancelPendingApprovals(): void {
    for (const resolve of this.approvals.values()) {
      resolve(false);
    }
    this.approvals.clear();
  }

  /** Runs one user turn: appends the message, streams the model, commits history. */
  async send(text: string): Promise<void> {
    const { onEvent, signal, settings } = this.options;
    const userMessage: ModelMessage = { role: "user", content: text };
    const messages: ModelMessage[] = [...this.history, userMessage];

    const tools: Record<string, Tool> = {};
    for (const descriptor of this.options.tools) {
      tools[descriptor.name] = tool({
        description: descriptor.description,
        inputSchema: z.object(descriptor.inputSchema),
        execute: async (args: unknown) =>
          unwrapToolResult(await descriptor.callback(args as never)),
      });
    }

    const model = this.options.model ?? createReactorChatModel(settings);

    // Messages produced by this turn: every completed step, converted
    // with the SDK's own toResponseMessages, so the committed history
    // is exactly the shape the model already saw mid-turn.
    const turnMessages: ModelMessage[] = [];

    const result = streamText({
      model,
      system: buildSystemPrompt(this.options.context),
      messages,
      tools,
      stopWhen: isStepCount(MAX_AGENT_STEPS),
      abortSignal: signal,
      onStepEnd: async (step) => {
        turnMessages.push(
          ...(await toResponseMessages({ content: step.content, tools })),
        );
      },
      toolApproval: async ({ toolCall }) => {
        const descriptor = this.options.tools.find(
          (t) => t.name === toolCall.toolName,
        );
        if (
          settings.autoApproveWrites ||
          !isWriteTool(toolCall.toolName, descriptor?.annotations)
        ) {
          return "not-applicable";
        }
        const toolCallId = toolCall.toolCallId;
        onEvent({
          type: "approval-request",
          toolCallId,
          name: toolCall.toolName,
          args: toolCall.input,
        });
        const approved = await new Promise<boolean>((resolve) => {
          this.approvals.set(toolCallId, resolve);
        });
        onEvent({ type: "approval-resolved", toolCallId, approved });
        return approved
          ? "approved"
          : {
              type: "denied",
              reason:
                "The user denied this action. Do not retry it; acknowledge the denial and ask how to proceed.",
            };
      },
    });

    for await (const part of result.fullStream) {
      this.handleStreamPart(part, onEvent);
    }

    // Commit the turn: the user message plus every completed step,
    // with orphaned tool calls dropped (step cap / abort).
    this.history = [
      ...this.history,
      userMessage,
      ...this.dropUnresolvedToolCalls(turnMessages),
    ];
    onEvent({ type: "finish" });
  }

  /**
   * Removes tool calls that were never executed (step cap or abort):
   * OpenAI-compatible APIs reject a tool call without its tool result.
   */
  private dropUnresolvedToolCalls(messages: ModelMessage[]): ModelMessage[] {
    const resolved = new Set<string>();
    for (const m of messages) {
      if (m.role === "tool") {
        for (const part of m.content) {
          if (part.type === "tool-result") {
            resolved.add(part.toolCallId);
          }
        }
      }
    }
    const out = [...messages];
    if (out.length === 0) {
      return out;
    }
    const last = out[out.length - 1];
    if (last.role !== "assistant" || typeof last.content === "string") {
      return out;
    }
    const content = last.content.filter(
      (part) => part.type !== "tool-call" || resolved.has(part.toolCallId),
    );
    if (content.length === 0) {
      out.pop();
    } else {
      out[out.length - 1] = { ...last, content };
    }
    return out;
  }

  private handleStreamPart(
    part: unknown,
    onEvent: (e: AgentEvent) => void,
  ): void {
    const p = part as { type: string };
    switch (p.type) {
      case "text-delta": {
        const { text } = p as { type: "text-delta"; text: string };
        onEvent({ type: "text-delta", delta: text });
        break;
      }
      case "tool-call": {
        const { toolCallId, toolName, input } = p as {
          type: "tool-call";
          toolCallId: string;
          toolName: string;
          input: unknown;
        };
        onEvent({
          type: "tool-start",
          toolCallId,
          name: toolName,
          args: input,
        });
        break;
      }
      case "tool-result": {
        const { toolCallId, toolName, output } = p as {
          type: "tool-result";
          toolCallId: string;
          toolName: string;
          output: unknown;
        };
        onEvent({
          type: "tool-result",
          toolCallId,
          name: toolName,
          state: "done",
          result: output,
        });
        break;
      }
      case "tool-error": {
        const { toolCallId, toolName, error } = p as {
          type: "tool-error";
          toolCallId: string;
          toolName: string;
          error: unknown;
        };
        onEvent({
          type: "tool-result",
          toolCallId,
          name: toolName,
          state: "error",
          error: error instanceof Error ? error.message : String(error),
        });
        break;
      }
      case "tool-approval-response": {
        const { approved, toolCall } = p as unknown as {
          approved: boolean;
          toolCall: { toolCallId: string; toolName: string };
        };
        if (!approved) {
          onEvent({
            type: "tool-result",
            toolCallId: toolCall.toolCallId,
            name: toolCall.toolName,
            state: "rejected",
          });
        }
        break;
      }
      case "tool-output-denied": {
        const { toolCallId, toolName } = p as {
          type: "tool-output-denied";
          toolCallId: string;
          toolName: string;
        };
        onEvent({
          type: "tool-result",
          toolCallId,
          name: toolName,
          state: "rejected",
        });
        break;
      }
      case "abort":
        // The loop ends; the hook observes the aborted controller.
        break;
      case "error": {
        const { error } = p as { type: "error"; error: unknown };
        onEvent({
          type: "error",
          error: error instanceof Error ? error.message : String(error),
        });
        break;
      }
      default:
        break;
    }
  }
}
