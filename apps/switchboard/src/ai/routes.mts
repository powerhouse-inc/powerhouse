import type {
  IHttpScope,
  RouteContext,
} from "@powerhousedao/shared/processors";
import type { ILogger } from "document-model";
import {
  deleteKey,
  maskKey,
  readKey,
  readModel,
  writeKey,
  writeModel,
  type AiSecretStore,
} from "./key-store.mjs";

/** Requests carry the conversation and base64 images, so more than the default. */
const MAX_CHAT_BODY_BYTES = 32 * 1024 * 1024;
const UPSTREAM_CHECK_TIMEOUT_MS = 15_000;
const MAX_KEY_CHARS = 512;

/** What of a chat request reaches the provider; routing overrides do not. */
const FORWARDED_CHAT_FIELDS = [
  "messages",
  "tools",
  "tool_choice",
  "parallel_tool_calls",
  "temperature",
  "top_p",
  "frequency_penalty",
  "presence_penalty",
  "stop",
  "seed",
  "response_format",
  "stream",
  "stream_options",
] as const;

export interface AiRoutesDeps {
  /** Whether this caller may use and manage the gateway. */
  isAdmin(address: string | undefined): boolean;
  /** Undefined while the workflow runtime is absent. */
  secrets(): Promise<AiSecretStore | undefined>;
  /** OpenAI-compatible base, without a trailing slash. */
  upstreamUrl: string;
  defaultModel: string;
  maxOutputTokens: number;
  appTitle: string;
  appUrl: string;
  logger: ILogger;
  fetchImpl?: typeof fetch;
}

function errorResponse(status: number, message: string, code: string) {
  // OpenAI's error shape, which OpenAI-compatible clients surface as is.
  return Response.json({ error: { message, code } }, { status });
}

/** Removes the stored key, and anything shaped like a credential, from text. */
export function redactSecrets(text: string, key: string | undefined): string {
  const named = key ? text.split(key).join("[redacted]") : text;
  return named
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/sk-[a-z0-9_-]{8,}/gi, "[redacted]");
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Never the request body or the parser's message: V8 quotes the input there. */
async function readJsonObject(
  request: Request,
): Promise<Record<string, unknown> | undefined> {
  try {
    const value: unknown = JSON.parse(await request.text());
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Serves the gateway: the OpenAI-compatible chat and model endpoints, and the
 * key and model administration. Every route is for admins, and the key never
 * leaves this module except as the upstream's bearer.
 */
export function registerAiRoutes(http: IHttpScope, deps: AiRoutesDeps): void {
  const { logger } = deps;
  const fetchImpl = deps.fetchImpl ?? fetch;

  const upstreamHeaders = (key: string) => ({
    authorization: `Bearer ${key}`,
    "http-referer": deps.appUrl,
    "x-title": deps.appTitle,
  });

  type Gate = { store: AiSecretStore } | { refused: Response };

  const gate = async (ctx: RouteContext): Promise<Gate> => {
    if (!deps.isAdmin(ctx.user?.address)) {
      return {
        refused: errorResponse(
          403,
          "The assistant is for this host's admins.",
          "forbidden",
        ),
      };
    }
    let store: AiSecretStore | undefined;
    try {
      store = await deps.secrets();
    } catch (error) {
      logger.error(
        "The AI gateway could not open the secret store: @message",
        redactSecrets(errorText(error), undefined),
      );
    }
    if (!store) {
      return {
        refused: errorResponse(
          503,
          "The assistant needs the workflow runtime, which is not running on this host.",
          "unavailable",
        ),
      };
    }
    return { store };
  };

  const currentModel = async (store: AiSecretStore) =>
    (await readModel(store)) ?? deps.defaultModel;

  const status = async (store: AiSecretStore) => {
    const stored = await readKey(store);
    return Response.json({
      configured: stored !== undefined,
      keyHint: stored ? maskKey(stored.value) : null,
      keySetBy: stored?.setBy ?? null,
      keySetAt: stored?.setAt ?? null,
      model: await currentModel(store),
    });
  };

  /** Keeps the provider's status; the body is rebuilt from its error message. */
  const upstreamFailure = async (upstream: Response, key: string) => {
    let message = `The AI provider answered HTTP ${upstream.status}.`;
    let code = "upstream_error";
    try {
      const body = (await upstream.json()) as {
        error?: { message?: unknown; code?: unknown };
      };
      if (typeof body.error?.message === "string") {
        message = redactSecrets(body.error.message, key);
      }
      if (typeof body.error?.code === "string") code = body.error.code;
    } catch {
      // Not JSON: the status line above says as much as we can repeat.
    }
    return errorResponse(upstream.status, message, code);
  };

  const unreachable = (error: unknown, key: string | undefined) => {
    logger.warn(
      "The AI gateway could not reach the provider: @message",
      redactSecrets(errorText(error), key),
    );
    return errorResponse(
      502,
      "The AI provider could not be reached.",
      "upstream_unreachable",
    );
  };

  http.route({
    method: "GET",
    path: "ai/status",
    auth: "renown",
    handler: async (_request, ctx) => {
      const gated = await gate(ctx);
      return "refused" in gated ? gated.refused : status(gated.store);
    },
  });

  // Tested before it is stored, so a typo cannot replace a working key.
  http.route({
    method: "PUT",
    path: "ai/key",
    auth: "renown",
    maxBodyBytes: 4096,
    handler: async (request, ctx) => {
      const gated = await gate(ctx);
      if ("refused" in gated) return gated.refused;
      const body = await readJsonObject(request);
      const value = typeof body?.value === "string" ? body.value.trim() : "";
      if (!value || value.length > MAX_KEY_CHARS || /\s/.test(value)) {
        return errorResponse(400, "Enter an OpenRouter key.", "invalid_key");
      }
      let check: Response;
      try {
        check = await fetchImpl(`${deps.upstreamUrl}/key`, {
          headers: upstreamHeaders(value),
          signal: AbortSignal.timeout(UPSTREAM_CHECK_TIMEOUT_MS),
        });
      } catch (error) {
        return unreachable(error, value);
      }
      if (!check.ok) {
        await check.body?.cancel();
        return errorResponse(
          400,
          `OpenRouter did not accept this key (HTTP ${check.status}).`,
          "invalid_key",
        );
      }
      await check.body?.cancel();
      await writeKey(gated.store, value, ctx.user?.address);
      logger.info("The AI gateway key was set by @actor", ctx.user?.address);
      return status(gated.store);
    },
  });

  http.route({
    method: "DELETE",
    path: "ai/key",
    auth: "renown",
    handler: async (_request, ctx) => {
      const gated = await gate(ctx);
      if ("refused" in gated) return gated.refused;
      await deleteKey(gated.store);
      logger.info("The AI gateway key was reset by @actor", ctx.user?.address);
      return status(gated.store);
    },
  });

  http.route({
    method: "PUT",
    path: "ai/model",
    auth: "renown",
    maxBodyBytes: 4096,
    handler: async (request, ctx) => {
      const gated = await gate(ctx);
      if ("refused" in gated) return gated.refused;
      const body = await readJsonObject(request);
      const model = typeof body?.model === "string" ? body.model.trim() : "";
      if (!model) {
        return errorResponse(400, "Name a model.", "invalid_model");
      }
      let listed: { data?: { id?: unknown }[] };
      try {
        const answer = await fetchImpl(`${deps.upstreamUrl}/models`, {
          signal: AbortSignal.timeout(UPSTREAM_CHECK_TIMEOUT_MS),
        });
        if (!answer.ok) throw new Error(`HTTP ${answer.status}`);
        listed = (await answer.json()) as typeof listed;
      } catch (error) {
        return unreachable(error, undefined);
      }
      if (!listed.data?.some((entry) => entry.id === model)) {
        return errorResponse(
          400,
          `OpenRouter has no model "${model}".`,
          "invalid_model",
        );
      }
      await writeModel(gated.store, model, ctx.user?.address);
      return status(gated.store);
    },
  });

  http.route({
    method: "GET",
    path: "ai/v1/models",
    auth: "renown",
    handler: async (_request, ctx) => {
      const gated = await gate(ctx);
      if ("refused" in gated) return gated.refused;
      const stored = await readKey(gated.store);
      if (!stored) return notConfigured();
      let upstream: Response;
      try {
        upstream = await fetchImpl(`${deps.upstreamUrl}/models`, {
          headers: upstreamHeaders(stored.value),
          signal: ctx.signal,
        });
      } catch (error) {
        return unreachable(error, stored.value);
      }
      if (!upstream.ok) return upstreamFailure(upstream, stored.value);
      return new Response(upstream.body, {
        status: upstream.status,
        headers: { "content-type": "application/json" },
      });
    },
  });

  http.route({
    method: "POST",
    path: "ai/v1/chat/completions",
    auth: "renown",
    maxBodyBytes: MAX_CHAT_BODY_BYTES,
    handler: async (request, ctx) => {
      const gated = await gate(ctx);
      if ("refused" in gated) return gated.refused;
      const stored = await readKey(gated.store);
      if (!stored) return notConfigured();
      const body = await readJsonObject(request);
      if (!Array.isArray(body?.messages)) {
        return errorResponse(
          400,
          "A chat request needs messages.",
          "invalid_request",
        );
      }

      const forwarded: Record<string, unknown> = {};
      for (const field of FORWARDED_CHAT_FIELDS) {
        if (body[field] !== undefined) forwarded[field] = body[field];
      }
      // The host's model, whatever the client named: cost is the host's call.
      forwarded.model = await currentModel(gated.store);
      const asked = body.max_tokens;
      forwarded.max_tokens =
        typeof asked === "number" && asked > 0
          ? Math.min(asked, deps.maxOutputTokens)
          : deps.maxOutputTokens;

      let upstream: Response;
      try {
        upstream = await fetchImpl(`${deps.upstreamUrl}/chat/completions`, {
          method: "POST",
          headers: {
            ...upstreamHeaders(stored.value),
            "content-type": "application/json",
          },
          body: JSON.stringify(forwarded),
          // A closed tab stops spending.
          signal: ctx.signal,
        });
      } catch (error) {
        return unreachable(error, stored.value);
      }
      if (!upstream.ok) return upstreamFailure(upstream, stored.value);
      return new Response(upstream.body, {
        status: upstream.status,
        headers: {
          "content-type":
            upstream.headers.get("content-type") ?? "text/event-stream",
          "cache-control": "no-cache",
          "x-accel-buffering": "no",
        },
      });
    },
  });
}

function notConfigured() {
  return errorResponse(
    503,
    "The assistant has no OpenRouter key yet.",
    "not_configured",
  );
}
