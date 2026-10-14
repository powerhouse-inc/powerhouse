import type { StreamChunk } from "../../core/types.js";

/**
 * Map a Mastra Agent fullStream to ph-clint StreamChunks.
 *
 * Handles both the direct property format (chunk.textDelta, chunk.toolName)
 * and the payload-wrapped format (chunk.payload.text) that Mastra uses
 * when Memory is attached to the agent.
 */
export async function* mapMastraStream(
  fullStream: AsyncIterable<{ type: string; [key: string]: unknown }>,
): AsyncGenerator<StreamChunk> {
  for await (const chunk of fullStream) {
    switch (chunk.type) {
      case "text-delta":
        yield {
          type: "text-delta",
          text: payloadOr(chunk, "text") ?? (chunk as any).textDelta ?? "",
        };
        break;

      case "tool-call":
        yield {
          type: "tool-call",
          toolCallId: payloadOr(chunk, "toolCallId") ?? undefined,
          toolName: payloadOr(chunk, "toolName") ?? "",
          args: payloadOr(chunk, "args") ?? {},
        };
        break;

      case "tool-result":
        yield {
          type: "tool-result",
          toolCallId: payloadOr(chunk, "toolCallId") ?? undefined,
          toolName: payloadOr(chunk, "toolName") ?? "",
          result: payloadOr(chunk, "result") ?? null,
          isError: payloadOr(chunk, "isError") ?? false,
        };
        break;

      case "tool-error":
        // Mastra emits 'tool-error' (not 'tool-result' with isError) when a tool throws
        yield {
          type: "tool-result",
          toolCallId: payloadOr(chunk, "toolCallId") ?? undefined,
          toolName: payloadOr(chunk, "toolName") ?? "",
          result: payloadOr(chunk, "error") ?? "Tool execution failed",
          isError: true,
        };
        break;

      case "error": {
        const raw = payloadOr(chunk, "error") ?? chunk;
        yield {
          type: "error",
          error: String(raw),
          ...classifyStreamError(raw),
        };
        break;
      }

      case "step-finish":
        yield {
          type: "step-finish",
          usage: extractUsage(chunk),
          finishReason: extractFinishReason(chunk),
        };
        break;

      case "finish":
        yield {
          type: "finish",
          usage: extractUsage(chunk),
          finishReason: extractFinishReason(chunk),
        };
        break;

      // Log but skip start, raw, etc.
      default:
        break;
    }
  }
}

/** Extract a field from chunk.payload (Memory format) or chunk directly. */
function payloadOr(chunk: any, field: string): any {
  return chunk.payload?.[field] ?? chunk[field];
}

const RETRYABLE_STATUS = new Set([
  408, 409, 425, 429, 500, 502, 503, 504, 520, 522, 524, 529,
]);
const RETRYABLE_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EPIPE",
  "EAI_AGAIN",
  "ENOTFOUND",
]);

/** Shape of the provider error fields we read to decide retry behavior. */
interface ProviderErrorShape {
  isRetryable?: unknown;
  statusCode?: unknown;
  code?: unknown;
  responseHeaders?: Record<string, unknown>;
}

/** Retry hints extracted from a provider error. */
interface StreamErrorHints {
  retryable: boolean;
  statusCode?: number;
  retryAfterMs?: number;
}

/**
 * Surface retry hints from a provider error: the AI SDK sets `isRetryable`,
 * `statusCode`, and a `retry-after` header; fall back to status/connection codes.
 */
function classifyStreamError(raw: unknown): StreamErrorHints {
  if (!raw || typeof raw !== "object") return { retryable: false };
  const e = raw as ProviderErrorShape;

  const statusCode =
    typeof e.statusCode === "number" ? e.statusCode : undefined;
  const code = typeof e.code === "string" ? e.code : undefined;

  const retryable =
    e.isRetryable === true ||
    (statusCode !== undefined && RETRYABLE_STATUS.has(statusCode)) ||
    (code !== undefined && RETRYABLE_CODES.has(code));

  let retryAfterMs: number | undefined;
  const retryAfter = e.responseHeaders?.["retry-after"];
  if (typeof retryAfter === "string") {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) retryAfterMs = seconds * 1000;
  }

  return { retryable, statusCode, retryAfterMs };
}

/**
 * Pull token usage out of a Mastra step-finish / finish chunk. The
 * canonical location (verified empirically against `@mastra/core` 1.32)
 * is `chunk.payload.output.usage`, with the fields already flattened to
 * the AI-SDK names: `inputTokens`, `outputTokens`, `totalTokens`,
 * `cachedInputTokens`, `cacheCreationInputTokens`, `reasoningTokens`.
 * Anthropic's raw `cache_creation_input_tokens` is at
 * `usage.raw.raw.cache_creation_input_tokens` if ever needed.
 */
const USAGE_KEYS = [
  "inputTokens",
  "outputTokens",
  "totalTokens",
  "cachedInputTokens",
  "cacheCreationInputTokens",
  "reasoningTokens",
] as const;

function extractUsage(
  chunk: any,
): import("../../core/types.js").StreamUsage | undefined {
  const usage = chunk?.payload?.output?.usage;
  if (!usage || typeof usage !== "object") return undefined;
  const out: Record<string, number> = {};
  for (const key of USAGE_KEYS) {
    const v = (usage as Record<string, unknown>)[key];
    if (typeof v === "number") out[key] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function extractFinishReason(chunk: any): string | undefined {
  const reason = chunk?.payload?.stepResult?.reason;
  return typeof reason === "string" ? reason : undefined;
}
