// Providers load on first use, so a step evaluates only the one it calls.
import type { Experimental_DecisionModel, LanguageModel } from "ai";
import { DEFAULT_MODELS, type AiConnection } from "./auth.js";
import { LanguageDecisionModel } from "./decision-model.js";
import { trimSlash } from "./model-list.js";

export type ChatModel = Exclude<LanguageModel, string>;

// Native providers fall back to env vars, and the worker's env is empty.
function requireKey(connection: AiConnection): string {
  if (!connection.apiKey) {
    throw new Error(`The ${connection.provider} connection has no API key.`);
  }
  return connection.apiKey;
}

export function resolveModelId(
  connection: AiConnection,
  model: string | undefined,
): string {
  const id = model?.trim() || DEFAULT_MODELS[connection.provider];
  if (!id) {
    throw new Error(
      `The ${connection.provider} connection has no default model. Choose a model on the step.`,
    );
  }
  return id;
}

async function openAICompatible(connection: AiConnection, modelId: string) {
  if (!connection.baseUrl) {
    throw new Error("The openai-compatible connection has no base URL.");
  }
  const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
  return createOpenAICompatible({
    name: "openai-compatible",
    baseURL: trimSlash(connection.baseUrl),
    apiKey: connection.apiKey,
    // Ollama, vLLM, llama.cpp, LM Studio and OpenRouter accept json_schema.
    supportsStructuredOutputs: true,
    includeUsage: true,
  }).chatModel(modelId);
}

// Strict JSON schema is the default on OpenAI and the OpenAI-compatible provider.
export function schemaOptions(strict: boolean) {
  if (strict) return {};
  const lax = { strictJsonSchema: false };
  return { providerOptions: { openai: lax, openaiCompatible: lax } };
}

export async function createLanguageModel(
  connection: AiConnection,
  modelId: string,
): Promise<ChatModel> {
  switch (connection.provider) {
    case "openai": {
      const { createOpenAI } = await import("@ai-sdk/openai");
      return createOpenAI({ apiKey: requireKey(connection) })(modelId);
    }
    case "anthropic": {
      const { createAnthropic } = await import("@ai-sdk/anthropic");
      return createAnthropic({ apiKey: requireKey(connection) })(modelId);
    }
    case "google": {
      const { createGoogleGenerativeAI } = await import("@ai-sdk/google");
      return createGoogleGenerativeAI({ apiKey: requireKey(connection) })(
        modelId,
      );
    }
    case "openai-compatible":
      return openAICompatible(connection, modelId);
    case "typesafe":
      throw new Error(
        "TypeSafe models only answer decisions. Use the Decide action, or a connection to another provider.",
      );
  }
}

export async function createDecisionModel(
  connection: AiConnection,
  modelId: string,
): Promise<Experimental_DecisionModel> {
  switch (connection.provider) {
    case "openai": {
      const { createOpenAI } = await import("@ai-sdk/openai");
      return createOpenAI({ apiKey: requireKey(connection) }).decisionModel(
        modelId,
      );
    }
    case "anthropic": {
      const { createAnthropic } = await import("@ai-sdk/anthropic");
      return createAnthropic({ apiKey: requireKey(connection) }).decisionModel(
        modelId,
      );
    }
    case "google": {
      const { createGoogleGenerativeAI } = await import("@ai-sdk/google");
      return createGoogleGenerativeAI({
        apiKey: requireKey(connection),
      }).decisionModel(modelId);
    }
    case "openai-compatible":
      return new LanguageDecisionModel(
        await openAICompatible(connection, modelId),
      );
    case "typesafe": {
      const { createTypeSafeAi } = await import("@ai-sdk/typesafe-ai");
      return createTypeSafeAi({
        // A self-hosted server may run without a key; the SDK still wants one.
        apiKey: connection.apiKey ?? "none",
        baseURL: connection.baseUrl,
      }).decisionModel(modelId);
    }
  }
}
