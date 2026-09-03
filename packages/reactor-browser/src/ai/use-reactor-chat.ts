import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import type { ModelMessage } from "ai";
import { ReactorChatAgent } from "./agent.js";
import { useChatContext } from "./context.js";
import {
  getAiSettings,
  isAiConfigured,
  subscribeAiSettings,
} from "./settings-store.js";
import type {
  AgentEvent,
  AiSettings,
  AiToolDescriptor,
  AiToolsProvider,
  ChatMessage,
  ChatPart,
  PendingApproval,
} from "./types.js";

function updateAssistantPart(
  messages: ChatMessage[],
  assistantId: string | null,
  update: (parts: ChatPart[]) => ChatPart[],
): ChatMessage[] {
  if (!assistantId) {
    return messages;
  }
  return messages.map((message) =>
    message.id === assistantId
      ? { ...message, parts: update(message.parts) }
      : message,
  );
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface UseReactorChatResult {
  messages: ChatMessage[];
  isStreaming: boolean;
  pendingApprovals: PendingApproval[];
  error: string | null;
  settings: AiSettings;
  configured: boolean;
  send: (text: string) => void;
  stop: () => void;
  approve: (toolCallId: string) => void;
  reject: (toolCallId: string) => void;
  clear: () => void;
}

/**
 * Drives one in-browser chat conversation against the reactor tools.
 *
 * `toolsProvider` lazily resolves the tool descriptors (e.g. from
 * `createReactorMcpProvider` bound to `window.ph.reactorClient`) when the
 * user sends a message, so the reactor does not need to be ready at render
 * time.
 */
export function useReactorChat(
  toolsProvider?: AiToolsProvider,
): UseReactorChatResult {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>(
    [],
  );
  const [error, setError] = useState<string | null>(null);
  const agentRef = useRef<ReactorChatAgent | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const streamingRef = useRef(false);
  const pendingRef = useRef<Set<string>>(new Set());
  const assistantIdRef = useRef<string | null>(null);
  const historyRef = useRef<ModelMessage[]>([]);

  const settings = useSyncExternalStore(subscribeAiSettings, getAiSettings);
  const context = useChatContext();

  const handleEvent = useCallback((event: AgentEvent) => {
    const assistantId = assistantIdRef.current;
    switch (event.type) {
      case "text-delta":
        setMessages((prev) =>
          updateAssistantPart(prev, assistantId, (parts) => {
            const last = parts[parts.length - 1] as ChatPart | undefined;
            if (last?.type === "text") {
              return [
                ...parts.slice(0, -1),
                { ...last, text: last.text + event.delta },
              ];
            }
            return [...parts, { type: "text", text: event.delta }];
          }),
        );
        break;
      case "tool-start":
        setMessages((prev) =>
          updateAssistantPart(prev, assistantId, (parts) => [
            ...parts,
            {
              type: "tool",
              toolCallId: event.toolCallId,
              name: event.name,
              args: event.args,
              // The SDK may invoke tool approval before the tool-call part
              // reaches the stream consumer, so approval-request can precede
              // tool-start. Seed the part in the awaiting state when that
              // happens instead of flashing "executing".
              state: pendingRef.current.has(event.toolCallId)
                ? "awaiting-approval"
                : "executing",
            },
          ]),
        );
        break;
      case "approval-request":
        pendingRef.current.add(event.toolCallId);
        setMessages((prev) =>
          updateAssistantPart(prev, assistantId, (parts) =>
            parts.map((part) =>
              part.type === "tool" && part.toolCallId === event.toolCallId
                ? { ...part, state: "awaiting-approval" }
                : part,
            ),
          ),
        );
        setPendingApprovals((prev) => [
          ...prev,
          {
            toolCallId: event.toolCallId,
            name: event.name,
            args: event.args,
          },
        ]);
        break;
      case "approval-resolved":
        pendingRef.current.delete(event.toolCallId);
        setPendingApprovals((prev) =>
          prev.filter((a) => a.toolCallId !== event.toolCallId),
        );
        if (!event.approved) {
          setMessages((prev) =>
            updateAssistantPart(prev, assistantId, (parts) =>
              parts.map((part) =>
                part.type === "tool" && part.toolCallId === event.toolCallId
                  ? { ...part, state: "rejected" }
                  : part,
              ),
            ),
          );
        }
        break;
      case "tool-result":
        setMessages((prev) =>
          updateAssistantPart(prev, assistantId, (parts) =>
            parts.map((part) =>
              part.type === "tool" && part.toolCallId === event.toolCallId
                ? {
                    ...part,
                    state: event.state,
                    result: event.result,
                    error: event.error,
                  }
                : part,
            ),
          ),
        );
        break;
      case "error":
        setError(event.error);
        break;
      case "finish":
        break;
    }
  }, []);

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || streamingRef.current) {
        return;
      }
      setError(null);

      const currentSettings = getAiSettings();
      if (!isAiConfigured(currentSettings)) {
        setError(
          "Configure the AI endpoint, API key and model in settings first.",
        );
        return;
      }

      void (async () => {
        let tools: AiToolDescriptor[];
        try {
          if (!toolsProvider) {
            throw new Error("No tool provider configured");
          }
          tools = await toolsProvider();
        } catch (toolError) {
          setError(
            `Could not initialise the reactor tools: ${toErrorMessage(toolError)}`,
          );
          return;
        }
        if (tools.length === 0) {
          setError("The reactor exposed no tools.");
          return;
        }

        const controller = new AbortController();
        abortRef.current = controller;
        const agent = new ReactorChatAgent({
          settings: currentSettings,
          tools,
          context,
          onEvent: handleEvent,
          signal: controller.signal,
          history: historyRef.current,
        });
        agentRef.current = agent;

        const assistantId = crypto.randomUUID();
        assistantIdRef.current = assistantId;
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "user",
            parts: [{ type: "text", text: trimmed }],
          },
          { id: assistantId, role: "assistant", parts: [] },
        ]);

        streamingRef.current = true;
        setIsStreaming(true);
        try {
          await agent.send(trimmed);
        } catch (sendError) {
          setError(toErrorMessage(sendError));
        } finally {
          streamingRef.current = false;
          setIsStreaming(false);
          abortRef.current = null;
          historyRef.current = agent.getHistory();
        }
      })();
    },
    [toolsProvider, context, handleEvent],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const approve = useCallback((toolCallId: string) => {
    agentRef.current?.approve(toolCallId);
  }, []);

  const reject = useCallback((toolCallId: string) => {
    agentRef.current?.reject(toolCallId);
  }, []);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    agentRef.current?.reset();
    agentRef.current = null;
    historyRef.current = [];
    pendingRef.current.clear();
    setPendingApprovals([]);
    setError(null);
    assistantIdRef.current = null;
  }, []);

  return {
    messages,
    isStreaming,
    pendingApprovals,
    error,
    settings,
    configured: isAiConfigured(settings),
    send,
    stop,
    approve,
    reject,
    clear,
  };
}
