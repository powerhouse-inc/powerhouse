import { PieceAuth, Property } from "@powerhousedao/pieces-framework";
import { listModels } from "./model-list.js";
import { PROVIDERS, type AiConnection, type Provider } from "./providers.js";

export {
  DEFAULT_MODELS,
  PROVIDERS,
  type AiConnection,
  type Provider,
} from "./providers.js";

// Providers whose endpoint comes from the connection; the key is optional.
const CUSTOM_ENDPOINT: readonly Provider[] = ["openai-compatible", "typesafe"];

function isProvider(value: unknown): value is Provider {
  return PROVIDERS.some((p) => p === value);
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

// Accepts the flat value `validate` gets and the `{ type, props }` on ctx.auth.
export function readConnection(auth: unknown): AiConnection {
  let props: Record<string, unknown> = {};
  if (auth !== null && typeof auth === "object") {
    props =
      "props" in auth && auth.props !== null && typeof auth.props === "object"
        ? (auth.props as Record<string, unknown>)
        : (auth as Record<string, unknown>);
  }
  const provider = props.provider;
  if (!isProvider(provider)) {
    throw new Error(
      `Unknown AI provider "${String(provider)}". Expected one of: ${PROVIDERS.join(", ")}.`,
    );
  }
  return {
    provider,
    apiKey: text(props.api_key),
    baseUrl: CUSTOM_ENDPOINT.includes(provider)
      ? text(props.base_url)
      : undefined,
  };
}

function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

type Validation = { valid: true } | { valid: false; error: string };

function checkFields(auth: unknown): Validation {
  try {
    const connection = readConnection(auth);
    if (connection.provider === "openai-compatible" && !connection.baseUrl) {
      return {
        valid: false,
        error:
          "A base URL is required for an OpenAI-compatible server, e.g. http://localhost:11434/v1.",
      };
    }
    if (connection.baseUrl && !isHttpUrl(connection.baseUrl)) {
      return {
        valid: false,
        error: `The base URL "${connection.baseUrl}" is not an http(s) URL.`,
      };
    }
    if (!connection.apiKey && !connection.baseUrl) {
      return {
        valid: false,
        error: `An API key is required for ${connection.provider}.`,
      };
    }
    return { valid: true };
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// Field checks, then a model listing: it tells a bad key, an unreachable
// server and an egress denial apart before the connection is saved.
export async function validateConnection(auth: unknown): Promise<Validation> {
  const fields = checkFields(auth);
  if (!fields.valid) return fields;
  try {
    await listModels(readConnection(auth));
    return { valid: true };
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export const aiAuth = PieceAuth.CustomAuth({
  displayName: "AI provider",
  description: "Credentials for an AI model provider.",
  required: true,
  props: {
    provider: Property.StaticDropdown<Provider>({
      displayName: "Provider",
      required: true,
      defaultValue: "openai",
      options: {
        options: [
          { label: "OpenAI", value: "openai" },
          { label: "Anthropic", value: "anthropic" },
          { label: "Google", value: "google" },
          { label: "OpenAI-compatible", value: "openai-compatible" },
          { label: "TypeSafe (Jev or self-hosted)", value: "typesafe" },
        ],
      },
    }),
    api_key: PieceAuth.SecretText({
      displayName: "API key",
      required: false,
      description:
        "Optional only for an OpenAI-compatible server or a self-hosted TypeSafe server.",
    }),
    base_url: Property.ShortText({
      displayName: "Base URL",
      required: false,
      description:
        "Required for OpenAI-compatible, e.g. http://localhost:11434/v1 for Ollama. Optional for TypeSafe, e.g. http://localhost:8009/v1. Ignored for other providers.",
    }),
  },
  validate: ({ auth }) => validateConnection(auth),
});
