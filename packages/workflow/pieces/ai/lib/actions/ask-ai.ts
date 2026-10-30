import { createAction, Property } from "@powerhousedao/pieces-framework";
import { generateText, type ModelMessage } from "ai";
import { aiAuth, readConnection } from "../auth.js";
import {
  createLanguageModel,
  resolveModelId,
  type ChatModel,
} from "../models.js";
import {
  creativityProp,
  maxOutputTokensProp,
  modelProp,
  positive,
  toTemperature,
  toText,
  toUsage,
} from "../props.js";

// The subset of ctx.store this action uses; the default scope is the flow.
export interface ConversationStore {
  get<T>(key: string): Promise<T | null>;
  put<T>(key: string, value: T): Promise<T>;
}

export function conversationStorageKey(key: string | undefined) {
  const trimmed = key?.trim();
  return trimmed ? `ask-ai-conversation:${trimmed}` : undefined;
}

// Ten turns; older messages are dropped when storing and sending.
export const MAX_CONVERSATION_MESSAGES = 20;

// The most recent messages, starting on a user turn.
function recent(messages: ModelMessage[]): ModelMessage[] {
  const kept = messages.slice(-MAX_CONVERSATION_MESSAGES);
  const start = kept.findIndex((message) => message.role === "user");
  return start < 0 ? [] : kept.slice(start);
}

// Accepts a bare message list and Activepieces' `{ messages }` shape.
async function readConversation(
  store: ConversationStore,
  storageKey: string,
): Promise<ModelMessage[]> {
  const stored = await store.get<unknown>(storageKey);
  if (Array.isArray(stored)) return recent(stored as ModelMessage[]);
  if (
    stored !== null &&
    typeof stored === "object" &&
    "messages" in stored &&
    Array.isArray(stored.messages)
  ) {
    return recent(stored.messages as ModelMessage[]);
  }
  return [];
}

export async function askAi(
  model: ChatModel,
  store: ConversationStore,
  options: {
    prompt: unknown;
    conversationKey?: string;
    maxOutputTokens?: number;
    temperature?: number;
  },
) {
  const prompt = toText(options.prompt);
  if (!prompt) throw new Error("The prompt is empty.");
  const storageKey = conversationStorageKey(options.conversationKey);
  const history = storageKey ? await readConversation(store, storageKey) : [];
  const messages: ModelMessage[] = [
    ...history,
    { role: "user", content: prompt },
  ];
  const result = await generateText({
    model,
    messages,
    maxOutputTokens: options.maxOutputTokens,
    temperature: options.temperature,
  });
  if (storageKey) {
    // Concurrent runs sharing a key: the last write wins.
    await store.put(
      storageKey,
      recent([...messages, { role: "assistant", content: result.text }]),
    );
  }
  return {
    text: result.text,
    usage: toUsage(result.usage),
    finishReason: result.finishReason,
  };
}

export const askAiAction = createAction({
  auth: aiAuth,
  name: "ask_ai",
  displayName: "Ask AI",
  description:
    "Ask AI to analyze, explain, draft or decide using your workflow data.",
  defaultTimeoutSeconds: 120,
  props: {
    model: modelProp(),
    prompt: Property.LongText({
      displayName: "Prompt",
      required: true,
      placeholder: "e.g. Draft a friendly reply to this customer email",
    }),
    conversationKey: Property.ShortText({
      displayName: "Conversation key",
      required: false,
      description:
        "Same key in this workflow continues the chat, keeping the last 10 turns. Empty starts fresh.",
      placeholder: "e.g. support-chat",
    }),
    creativity: creativityProp(),
    maxOutputTokens: maxOutputTokensProp(),
  },
  run: async (ctx) => {
    const connection = readConnection(ctx.auth);
    const model = await createLanguageModel(
      connection,
      resolveModelId(connection, ctx.propsValue.model),
    );
    return askAi(model, ctx.store, {
      prompt: ctx.propsValue.prompt,
      conversationKey: ctx.propsValue.conversationKey,
      maxOutputTokens: positive(ctx.propsValue.maxOutputTokens),
      temperature: toTemperature(ctx.propsValue.creativity),
    });
  },
});
