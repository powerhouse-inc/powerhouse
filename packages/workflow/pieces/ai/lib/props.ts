import { Property } from "@powerhousedao/pieces-framework";
import type { LanguageModelUsage } from "ai";
import { aiAuth, DEFAULT_MODELS, readConnection } from "./auth.js";
import { listModels } from "./model-list.js";

export const modelProp = () =>
  Property.Dropdown<string, false, typeof aiAuth>({
    auth: aiAuth,
    displayName: "Model",
    required: false,
    description:
      "Leave empty for the provider's default model. OpenAI-compatible servers have no default.",
    refreshers: [],
    options: async ({ auth }) => {
      if (!auth) {
        return {
          disabled: true,
          placeholder: "Choose a connection first",
          options: [],
        };
      }
      try {
        const connection = readConnection(auth);
        const options = await listModels(connection);
        return DEFAULT_MODELS[connection.provider]
          ? { options }
          : { options, placeholder: "Choose a model" };
      } catch (err) {
        return {
          disabled: true,
          placeholder: err instanceof Error ? err.message : String(err),
          options: [],
        };
      }
    },
  });

export const maxOutputTokensProp = () =>
  Property.Number({
    displayName: "Max tokens",
    required: false,
    defaultValue: 2000,
    description:
      "Longest reply allowed, in tokens. Raise it if a long reply fails or stops short.",
    advanced: true,
  });

export const creativityProp = () =>
  Property.Number({
    displayName: "Creativity",
    required: false,
    description: "From 0 to 100. Lower is focused, higher is creative.",
    display: "stepper",
    min: 0,
    max: 100,
    step: 10,
    advanced: true,
  });

// 0–100 to the SDK's temperature; unset leaves the provider's default.
export function toTemperature(creativity: number | undefined | null) {
  if (creativity === undefined || creativity === null) return undefined;
  return Math.min(100, Math.max(0, creativity)) / 100;
}

export function positive(value: number | undefined | null) {
  return typeof value === "number" && value > 0 ? Math.floor(value) : undefined;
}

export function toUsage(usage: LanguageModelUsage) {
  return { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens };
}

// Step inputs may resolve to JSON; the model gets it as text.
export function toText(value: unknown): string {
  if (value === undefined || value === null) return "";
  return (typeof value === "string" ? value : JSON.stringify(value)).trim();
}
