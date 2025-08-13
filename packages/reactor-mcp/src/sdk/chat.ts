import { createOpenAI } from "@ai-sdk/openai";
import type { ModelMessage, Provider } from "ai";
import { streamText } from "ai";
import { logger } from "../logger.js";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ChatOptions {
  provider?: Provider;
  model?: string;
  systemPrompt?: string;
}

export class LLMChat {
  private provider: Provider;
  private model: string;
  private systemPrompt: string;

  constructor(options: ChatOptions = {}) {
    this.provider =
      options.provider ||
      createOpenAI({
        apiKey: process.env.OPENAI_API_KEY || "",
      });
    this.model = options.model || "gpt-4-turbo";
    this.systemPrompt = options.systemPrompt || "You are a helpful assistant.";
  }

  async sendMessage(messages: ChatMessage[]): Promise<string> {
    try {
      const coreMessages: ModelMessage[] = messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      const result = streamText({
        model: this.provider.languageModel(this.model),
        system: this.systemPrompt,
        messages: coreMessages,
      });

      let fullResponse = "";
      for await (const textPart of result.textStream) {
        fullResponse += textPart;
      }

      return fullResponse;
    } catch (error) {
      logger.error("Error sending message to LLM:", error);
      throw error;
    }
  }

  async streamMessage(
    messages: ChatMessage[],
    onChunk: (chunk: string) => void,
  ): Promise<void> {
    try {
      const coreMessages: ModelMessage[] = messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      const result = streamText({
        model: this.provider.languageModel(this.model),
        system: this.systemPrompt,
        messages: coreMessages,
      });

      for await (const textPart of result.textStream) {
        onChunk(textPart);
      }
    } catch (error) {
      logger.error("Error streaming message from LLM:", error);
      throw error;
    }
  }
}
