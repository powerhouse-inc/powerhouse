import { DEFAULT_MODELS, type AiConnection } from "./providers.js";

export interface ModelOption {
  label: string;
  value: string;
}

// Chat models only; the providers also list embeddings, audio and images.
const OPENAI_CHAT = /^(gpt-|o\d|chatgpt-)/;
const OPENAI_NOT_CHAT = /(audio|realtime|transcribe|tts|image|search)/;

// The worker's egress guard fails a fetch with code EGRESS_DENIED, often
// wrapped as the cause of fetch's own TypeError.
function egressDenied(err: unknown): boolean {
  for (let e = err, depth = 0; e && depth < 5; depth++) {
    if (typeof e !== "object") return false;
    const { code, message, cause } = e as Record<string, unknown>;
    if (code === "EGRESS_DENIED") return true;
    if (typeof message === "string" && message.includes("Egress denied:")) {
      return true;
    }
    e = cause;
  }
  return false;
}

async function getJson(
  url: string,
  headers: Record<string, string>,
): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
  } catch (err) {
    const { origin } = new URL(url);
    if (egressDenied(err)) {
      throw new Error(
        `The workflow runtime's egress policy blocks ${origin}. An admin can allow it with PH_WORKFLOWS_EGRESS_ALLOW_ADDRESSES.`,
        { cause: err },
      );
    }
    const cause = err instanceof Error ? (err.cause ?? err) : err;
    throw new Error(
      `Could not reach ${origin}: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause: err },
    );
  }
  if (!res.ok) {
    throw new Error(
      res.status === 401 || res.status === 403
        ? "The provider rejected the API key."
        : `The provider answered ${res.status}.`,
    );
  }
  return res.json();
}

function ids(body: unknown, field: string): string[] {
  const list =
    body !== null && typeof body === "object" && "data" in body
      ? body.data
      : body !== null && typeof body === "object" && "models" in body
        ? body.models
        : [];
  if (!Array.isArray(list)) return [];
  return list.flatMap((item: unknown) => {
    if (item === null || typeof item !== "object") return [];
    const value = (item as Record<string, unknown>)[field];
    return typeof value === "string" ? [value] : [];
  });
}

export function trimSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export async function listModels(
  connection: AiConnection,
): Promise<ModelOption[]> {
  const key = connection.apiKey ?? "";
  let models: string[];
  switch (connection.provider) {
    case "openai":
      models = ids(
        await getJson("https://api.openai.com/v1/models", {
          authorization: `Bearer ${key}`,
        }),
        "id",
      ).filter((id) => OPENAI_CHAT.test(id) && !OPENAI_NOT_CHAT.test(id));
      break;
    case "anthropic":
      models = ids(
        await getJson("https://api.anthropic.com/v1/models?limit=100", {
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
        }),
        "id",
      );
      break;
    case "google":
      models = ids(
        await getJson(
          "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000",
          { "x-goog-api-key": key },
        ),
        "name",
      )
        .map((name) => name.replace(/^models\//, ""))
        .filter((id) => id.startsWith("gemini-"));
      break;
    case "openai-compatible":
      models = ids(
        await getJson(
          `${trimSlash(connection.baseUrl ?? "")}/models`,
          key ? { authorization: `Bearer ${key}` } : {},
        ),
        "id",
      );
      break;
    case "typesafe":
      // System One servers have no model list.
      models = [];
      break;
  }
  const fallback = DEFAULT_MODELS[connection.provider];
  const unique = [
    ...new Set([...(fallback ? [fallback] : []), ...models.sort()]),
  ];
  return unique.map((id) => ({
    label: id === fallback ? `${id} (default)` : id,
    value: id,
  }));
}
