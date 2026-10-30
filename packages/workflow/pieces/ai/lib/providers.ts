export const PROVIDERS = [
  "openai",
  "anthropic",
  "google",
  "openai-compatible",
  "typesafe",
] as const;
export type Provider = (typeof PROVIDERS)[number];

// An OpenAI-compatible server has no known model, so the step must pick one.
export const DEFAULT_MODELS: Record<Provider, string | undefined> = {
  openai: "gpt-6-luna",
  anthropic: "claude-haiku-4-5",
  google: "gemini-flash-latest",
  "openai-compatible": undefined,
  typesafe: "jev-latest",
};

export interface AiConnection {
  provider: Provider;
  apiKey?: string;
  // OpenAI-compatible and TypeSafe only.
  baseUrl?: string;
}
