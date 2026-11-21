/**
 * Bridge between clint StreamChunks and chat-session document operations.
 *
 * Consumes an agent's StreamChunk generator and dispatches the corresponding
 * chat-session operations to the reactor, producing a streaming experience
 * in any client watching the document (Connect UI, MCP, etc.).
 *
 * Text deltas are accumulated and flushed on a throttle interval (~500ms)
 * to avoid flooding the reactor with per-token operations.
 */
import { randomUUID } from "node:crypto";
import type { StreamChunk, ReactorContext, Logger } from "@powerhousedao/clint";
import {
  addAssistantMessage,
  appendAssistantContent,
  updateAssistantContent,
  addToolResult,
  addToolOutput,
  updateUsageSummary,
  failTurn,
  finishAssistantMessage,
} from "@powerhousedao/clint-common/document-models/chat-session";
import type { ChatSessionAction } from "@powerhousedao/clint-common/document-models/chat-session";
import type { ChatSessionRegistry } from "./chat-session-init.js";

const FLUSH_INTERVAL_MS = 500;

/**
 * Failure codes written to `TurnFailure.code`. The editor keys on
 * BUDGET_EXHAUSTED; the others are informational.
 */
export type TurnFailureCode =
  | "BUDGET_EXHAUSTED"
  | "RATE_LIMITED"
  | "PROVIDER_ERROR"
  | "AGENT_ERROR"
  | "INTERRUPTED";

export interface TurnFailureInfo {
  code: TurnFailureCode;
  /** Human-readable reason shown in the conversation. */
  message: string;
  /** Whether re-running the turn may succeed (automatic retry, then the user's Retry). */
  retryable: boolean;
}

/**
 * Transient stream failure. Raised whether or not content was already written:
 * the caller re-runs the turn (with a continue prompt when `wroteContent`), and
 * the agent's memory holds the steps that completed. The session stays ACTIVE.
 */
export interface RetryableStreamErrorOptions {
  retryAfterMs?: number;
  statusCode?: number;
  code?: TurnFailureCode;
  wroteContent?: boolean;
}

export class RetryableStreamError extends Error {
  readonly retryAfterMs?: number;
  readonly statusCode?: number;
  readonly code: TurnFailureCode;
  /** True when this attempt wrote messages before failing. */
  readonly wroteContent: boolean;
  constructor(message: string, opts?: RetryableStreamErrorOptions) {
    super(message);
    this.name = "RetryableStreamError";
    this.retryAfterMs = opts?.retryAfterMs;
    this.statusCode = opts?.statusCode;
    this.code = opts?.code ?? "PROVIDER_ERROR";
    this.wroteContent = opts?.wroteContent ?? false;
  }
}

const MAX_FAILURE_DETAIL_CHARS = 500;

const FAILURE_SUMMARY: Record<TurnFailureCode, string> = {
  BUDGET_EXHAUSTED: "Not enough credits to continue",
  RATE_LIMITED: "The model provider is rate limiting requests",
  PROVIDER_ERROR: "The model provider returned an error",
  AGENT_ERROR: "The agent failed to respond",
  INTERRUPTED: "The response was interrupted",
};

/** "<summary>: <detail>", with the detail trimmed of noise and bounded. */
export function describeFailure(
  code: TurnFailureCode,
  detail?: string,
): string {
  let text = (detail ?? "").trim().replace(/^(AI_)?[A-Za-z]*Error:\s*/, "");
  if (text.length > MAX_FAILURE_DETAIL_CHARS)
    text = `${text.slice(0, MAX_FAILURE_DETAIL_CHARS)}…`;
  return text
    ? `${FAILURE_SUMMARY[code]}: ${text}`
    : `${FAILURE_SUMMARY[code]}.`;
}

/** A budget/credit refusal (OpenRouter answers 402 or "requires more credits"). */
function isBudgetRefusal(message: string, statusCode?: number): boolean {
  return statusCode === 402 || /requires more credits/i.test(message);
}

/**
 * Classify a provider failure. Budget refusals are never retryable, whatever
 * the provider claims; otherwise the provider's retry hint decides.
 */
export function classifyTurnFailure(input: {
  message: string;
  statusCode?: number;
  retryable?: boolean;
  isAgentError?: boolean;
}): TurnFailureInfo {
  const { message, statusCode } = input;
  if (isBudgetRefusal(message, statusCode)) {
    return {
      code: "BUDGET_EXHAUSTED",
      message: describeFailure("BUDGET_EXHAUSTED", message),
      retryable: false,
    };
  }
  const retryable = input.retryable === true;
  const code: TurnFailureCode =
    statusCode === 429
      ? "RATE_LIMITED"
      : input.isAgentError
        ? "AGENT_ERROR"
        : "PROVIDER_ERROR";
  return { code, message: describeFailure(code, message), retryable };
}

const RETRYABLE_STATUS = new Set([
  408, 409, 425, 429, 500, 502, 503, 504, 520, 522, 524, 529,
]);
const RETRYABLE_NETWORK_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EPIPE",
  "EAI_AGAIN",
  "ENOTFOUND",
]);

/** Classify an error thrown by the agent stream (e.g. an APICallError before the first chunk). */
function classifyThrownError(
  err: unknown,
): TurnFailureInfo & { statusCode?: number } {
  const e = (err && typeof err === "object" ? err : {}) as {
    message?: unknown;
    statusCode?: unknown;
    isRetryable?: unknown;
    code?: unknown;
  };
  const message = typeof e.message === "string" ? e.message : String(err);
  const statusCode =
    typeof e.statusCode === "number" ? e.statusCode : undefined;
  const networkCode =
    typeof e.code === "string" && RETRYABLE_NETWORK_CODES.has(e.code);
  const fromProvider =
    statusCode !== undefined ||
    typeof e.isRetryable === "boolean" ||
    networkCode;
  const retryable =
    e.isRetryable === true ||
    (statusCode !== undefined && RETRYABLE_STATUS.has(statusCode)) ||
    networkCode;
  return {
    ...classifyTurnFailure({
      message,
      statusCode,
      retryable,
      isAgentError: !fromProvider,
    }),
    statusCode,
  };
}

export interface FailTurnOptions extends TurnFailureInfo {
  /** The USER message whose turn failed; resolved from the document when omitted. */
  userMessageId?: string;
}

/**
 * Record a failed turn with FAIL_TURN: a finished ASSISTANT error message the
 * editor shows (with Retry when retryable). The session stays ACTIVE.
 */
export async function dispatchFailTurn<R extends ChatSessionRegistry>(
  reactor: ReactorContext<R>,
  documentId: string,
  opts: FailTurnOptions,
): Promise<void> {
  let userMessageId = opts.userMessageId;
  if (!userMessageId) {
    const doc = await reactor.client.get<"powerhouse/chat-session">(documentId);
    const messages = doc.state.global.messages;
    userMessageId = [...messages].reverse().find((m) => m.role === "USER")?.id;
  }
  const failedAt = new Date().toISOString();
  if (!userMessageId) {
    // No user message to attach the failure to: record a plain finished error message.
    const id = randomUUID();
    await reactor.client.execute<"powerhouse/chat-session">(
      documentId,
      "main",
      [
        addAssistantMessage({
          id,
          content: [{ id: randomUUID(), type: "ERROR", error: opts.message }],
          createdAt: failedAt,
        }),
        finishAssistantMessage({
          messageId: id,
          finishReason: "error",
          finishedAt: failedAt,
        }),
      ],
    );
    return;
  }
  await reactor.client.execute<"powerhouse/chat-session">(documentId, "main", [
    failTurn({
      id: randomUUID(),
      userMessageId,
      code: opts.code,
      message: opts.message,
      retryable: opts.retryable,
      failedAt,
    }),
  ]);
}

interface BridgeStats {
  totalMessages: number;
  totalSteps: number;
  totalToolCalls: number;
}

export interface WriteBridgeOptions<
  R extends ChatSessionRegistry = ChatSessionRegistry,
> {
  reactor: ReactorContext<R>;
  documentId: string;
  log?: Logger;
  /** The USER message this turn answers; used by FAIL_TURN. Defaults to the last USER message. */
  userMessageId?: string;
}

export interface WriteBridgeResult {
  /** `failed`: a non-retryable failure was recorded with FAIL_TURN. */
  outcome: "completed" | "failed";
}

/**
 * finishReason written on a partial assistant message the turn moves past:
 * `retry` when a retryable error cut it off, `restart` when a restart did.
 * Neither ends the turn.
 */
export const SUPERSEDED_FINISH_REASONS: ReadonlySet<string> = new Set([
  "retry",
  "restart",
]);

const TAG = "[chat-bridge]";

/**
 * Cap on any tool text persisted to the document. The document is a mirror —
 * the model reads the full result from its own memory — so verbose tools
 * (command output, search) are elided rather than bloating every load.
 */
const MAX_TOOL_RESULT_CHARS = 1_000;

/**
 * Make tool text safe and bounded for the operation store: cap its length,
 * then strip characters JSON-backed stores (Postgres jsonb) reject — NUL and
 * unpaired surrogates, which otherwise fail the write with "unsupported
 * Unicode escape sequence". Applies to every tool result, not just reads.
 */
function sanitizeForStore(
  text: string,
  log?: Logger,
  label = "tool result",
): string {
  let capped = text;
  if (text.length > MAX_TOOL_RESULT_CHARS) {
    log?.warn(
      `${TAG} truncated ${label} from ${text.length} to ${MAX_TOOL_RESULT_CHARS} chars`,
    );
    capped = `${text.slice(0, MAX_TOOL_RESULT_CHARS)}\n…[truncated ${text.length - MAX_TOOL_RESULT_CHARS} chars]`;
  }
  let out = "";
  for (let i = 0; i < capped.length; i++) {
    const code = capped.charCodeAt(i);
    if (code === 0) continue; // NUL
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = capped.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        out += capped[i] + capped[i + 1];
        i++;
      } else {
        out += "�"; // unpaired high surrogate
      }
      continue;
    }
    if (code >= 0xdc00 && code <= 0xdfff) {
      out += "�"; // unpaired low surrogate
      continue;
    }
    out += capped[i];
  }
  return out;
}

/**
 * Tools whose result is file contents. The document never stores file bodies —
 * the model has the full read via its own memory — so only the metadata header
 * the tool prepends ("path (N bytes, encoding)") is persisted.
 */
const FILE_CONTENT_TOOLS = new Set(["mastra_workspace_read_file"]);

/**
 * Build the persisted form of a tool result. Workspace media reads return a
 * base64 blob ({ __workspaceMedia, text, mediaType, data }); keep the header
 * and media type, drop the blob. File-content tools keep only their header
 * line. Everything else is serialized, capped, and stripped of store-hostile
 * characters.
 */
/** Mastra wraps a tool throw in an error envelope that triples the message
 *  (message, details.errorMessage, cause) alongside generic domain/category/
 *  code/argsJson fields. Only the message is actionable, so collapse to it —
 *  keeps the stored result small for the reader and the model's context. The
 *  result reaches here either as the object or already JSON-stringified. */
function condenseErrorEnvelope(result: unknown): string | null {
  // Thrown error instance (MastraError and subclasses): the fields show via a
  // toJSON, not own properties, so read the message directly.
  if (result instanceof Error) {
    return typeof result.message === "string" && result.message
      ? result.message
      : null;
  }
  let obj: unknown = result;
  if (typeof obj === "string") {
    const s = obj.trim();
    if (!(s.startsWith("{") && s.includes('"code"') && s.includes('"domain"')))
      return null;
    try {
      obj = JSON.parse(s);
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== "object") return null;
  const e = obj as {
    message?: unknown;
    code?: unknown;
    domain?: unknown;
    details?: unknown;
  };
  if (
    typeof e.message === "string" &&
    (typeof e.code === "string" ||
      typeof e.domain === "string" ||
      e.details !== undefined)
  ) {
    return e.message;
  }
  return null;
}

function prepareToolResult(
  result: unknown,
  toolName: string,
  log?: Logger,
): { result: string; mediaType: string | null } {
  if (
    result &&
    typeof result === "object" &&
    (result as { __workspaceMedia?: unknown }).__workspaceMedia
  ) {
    const media = result as { text?: string; mediaType?: string };
    return {
      result: sanitizeForStore(media.text ?? "[media]", log, toolName),
      mediaType: media.mediaType ?? null,
    };
  }
  const condensed = condenseErrorEnvelope(result);
  if (condensed !== null) {
    return {
      result: sanitizeForStore(condensed, log, toolName),
      mediaType: null,
    };
  }
  const raw =
    typeof result === "string" ? result : (JSON.stringify(result) ?? "");
  if (FILE_CONTENT_TOOLS.has(toolName)) {
    // Keep the header line only; everything after the first newline is file body.
    return {
      result: sanitizeForStore(raw.split("\n", 1)[0], log, toolName),
      mediaType: null,
    };
  }
  return { result: sanitizeForStore(raw, log, toolName), mediaType: null };
}

/**
 * Consume an agent stream and write each chunk to a chat-session document.
 *
 * Never ends the session. A retryable failure throws RetryableStreamError
 * (after content or not) for the caller to re-run the turn; any other failure
 * is recorded with FAIL_TURN and resolves `{ outcome: 'failed' }`.
 */
export async function writeAgentStreamToDocument<R extends ChatSessionRegistry>(
  stream: AsyncGenerator<StreamChunk>,
  options: WriteBridgeOptions<R>,
): Promise<WriteBridgeResult> {
  const { reactor, documentId, log, userMessageId } = options;
  const dispatch = (action: ChatSessionAction) =>
    reactor.client.execute<"powerhouse/chat-session">(documentId, "main", [
      action,
    ]);

  // State machine
  let currentMsgId: string | null = null;
  let currentPartId: string | null = null;
  let textBuffer = "";
  let stepIndex = 0;
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let currentToolMsgId: string | null = null;
  let lastAssistantMsgId: string | null = null;
  let finishReason: string | null = null;
  const stats: BridgeStats = {
    totalMessages: 0,
    totalSteps: 0,
    totalToolCalls: 0,
  };

  // Per-turn token usage from the agent stream
  type StreamUsage = NonNullable<
    Extract<StreamChunk, { type: "finish" }>["usage"]
  >;
  let finishUsage: StreamUsage | undefined;
  let stepUsage: StreamUsage | undefined;
  let usageRecorded = false;

  const now = () => new Date().toISOString();

  async function flushText(): Promise<void> {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (!textBuffer || !currentMsgId || !currentPartId) return;

    await dispatch(
      updateAssistantContent({
        messageId: currentMsgId,
        partId: currentPartId,
        text: textBuffer,
      }),
    );
  }

  function scheduleFlush(): void {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flushText().catch((err) =>
        log?.error(`${TAG} throttled flush error:`, err),
      );
    }, FLUSH_INTERVAL_MS);
  }

  try {
    for await (const chunk of stream) {
      switch (chunk.type) {
        case "text-delta": {
          if (!currentMsgId) {
            currentMsgId = randomUUID();
            currentPartId = randomUUID();
            textBuffer = chunk.text;
            lastAssistantMsgId = currentMsgId;
            stats.totalMessages++;
            stats.totalSteps++;

            await dispatch(
              addAssistantMessage({
                id: currentMsgId,
                content: [
                  {
                    id: currentPartId,
                    type: "TEXT",
                    text: chunk.text,
                  },
                ],
                stepIndex,
                createdAt: now(),
              }),
            );
          } else {
            textBuffer += chunk.text;
            scheduleFlush();
          }
          break;
        }

        case "tool-call": {
          await flushText();

          if (!currentMsgId) {
            currentMsgId = randomUUID();
            currentPartId = randomUUID();
            lastAssistantMsgId = currentMsgId;
            stats.totalMessages++;
            stats.totalSteps++;

            await dispatch(
              addAssistantMessage({
                id: currentMsgId,
                content: [
                  {
                    id: currentPartId,
                    type: "TOOL_CALL",
                    toolCallId: chunk.toolCallId ?? randomUUID(),
                    toolName: chunk.toolName,
                    args:
                      typeof chunk.args === "string"
                        ? chunk.args
                        : JSON.stringify(chunk.args),
                  },
                ],
                stepIndex,
                createdAt: now(),
              }),
            );
          } else {
            const partId = randomUUID();
            stats.totalToolCalls++;

            await dispatch(
              appendAssistantContent({
                messageId: currentMsgId,
                part: {
                  id: partId,
                  type: "TOOL_CALL",
                  toolCallId: chunk.toolCallId ?? randomUUID(),
                  toolName: chunk.toolName,
                  args:
                    typeof chunk.args === "string"
                      ? chunk.args
                      : JSON.stringify(chunk.args),
                },
              }),
            );
          }
          break;
        }

        case "tool-result": {
          await flushText();

          const toolMsgId = randomUUID();
          const toolPartId = randomUUID();
          currentToolMsgId = toolMsgId;
          stats.totalMessages++;

          const prepared = prepareToolResult(chunk.result, chunk.toolName, log);

          await dispatch(
            addToolResult({
              id: toolMsgId,
              content: [
                {
                  id: toolPartId,
                  type: "TOOL_RESULT",
                  toolCallId: chunk.toolCallId ?? "",
                  toolName: chunk.toolName,
                  result: prepared.result,
                  mediaType: prepared.mediaType,
                  isError: chunk.isError ?? false,
                },
              ],
              stepIndex,
              createdAt: now(),
            }),
          );

          stepIndex++;
          currentMsgId = null;
          currentPartId = null;
          textBuffer = "";
          break;
        }

        case "tool-output": {
          if (currentToolMsgId) {
            const partId = randomUUID();
            await dispatch(
              addToolOutput({
                messageId: currentToolMsgId,
                partId,
                toolCallId: chunk.toolCallId ?? "",
                toolName: chunk.toolName,
                text: sanitizeForStore(
                  chunk.text,
                  log,
                  `${chunk.toolName} output`,
                ),
              }),
            );
          }
          break;
        }

        case "step-finish": {
          if (chunk.usage) {
            stepUsage = {
              inputTokens:
                (stepUsage?.inputTokens ?? 0) + (chunk.usage.inputTokens ?? 0),
              outputTokens:
                (stepUsage?.outputTokens ?? 0) +
                (chunk.usage.outputTokens ?? 0),
              totalTokens:
                (stepUsage?.totalTokens ?? 0) + (chunk.usage.totalTokens ?? 0),
              cachedInputTokens:
                (stepUsage?.cachedInputTokens ?? 0) +
                (chunk.usage.cachedInputTokens ?? 0),
              cacheCreationInputTokens:
                (stepUsage?.cacheCreationInputTokens ?? 0) +
                (chunk.usage.cacheCreationInputTokens ?? 0),
              reasoningTokens:
                (stepUsage?.reasoningTokens ?? 0) +
                (chunk.usage.reasoningTokens ?? 0),
            };
          }
          break;
        }

        case "finish": {
          finishReason = chunk.finishReason ?? null;
          finishUsage = chunk.usage;
          break;
        }

        case "error": {
          await flushText();
          const message =
            chunk.error || "Agent stream failed with an unknown error";
          const failure = classifyTurnFailure({
            message,
            statusCode: chunk.statusCode,
            retryable: chunk.retryable,
          });
          if (failure.retryable) {
            log?.warn(
              `${TAG} retryable stream error for ${documentId} (${stats.totalMessages} msgs written): ${message}`,
            );
            // Closing the cut-off message is best-effort: it must not turn a retryable error fatal.
            await settlePartial("retry").catch((e: unknown) =>
              log?.error(`${TAG} failed to close partial message:`, e),
            );
            throw new RetryableStreamError(message, {
              retryAfterMs: chunk.retryAfterMs,
              statusCode: chunk.statusCode,
              code: failure.code,
              wroteContent: stats.totalMessages > 0,
            });
          }
          log?.error(`${TAG} stream error for ${documentId}: ${message}`);
          await failTheTurn(failure);
          return { outcome: "failed" };
        }
      }
    }

    await flushText();
    const totals = await recordUsage(true);

    if (lastAssistantMsgId) {
      await dispatch(
        finishAssistantMessage({
          messageId: lastAssistantMsgId,
          finishReason,
          finishedAt: now(),
        }),
      );
    }

    log?.info(
      `${TAG} stream complete for ${documentId}: ` +
        `${stats.totalMessages} msgs, ${stats.totalSteps} steps, ${stats.totalToolCalls} tool calls` +
        (totals ? `, ${totals} tokens` : ""),
    );
    return { outcome: "completed" };
  } catch (err) {
    await flushText().catch(() => {});

    if (err instanceof RetryableStreamError) throw err;

    if (err instanceof Error && err.name === "AbortError") {
      // Interrupted: keep what was written, close the open message.
      log?.info(`${TAG} stream aborted for ${documentId}`);
      await settlePartial("abort").catch(() => {});
      return { outcome: "completed" };
    }

    const failure = classifyThrownError(err);
    if (failure.retryable) {
      log?.warn(`${TAG} retryable stream failure for ${documentId}:`, err);
      await settlePartial("retry").catch(() => {});
      throw new RetryableStreamError(
        err instanceof Error ? err.message : String(err),
        {
          statusCode: failure.statusCode,
          code: failure.code,
          wroteContent: stats.totalMessages > 0,
        },
      );
    }

    log?.error(`${TAG} fatal error for ${documentId}:`, err);
    await failTheTurn(failure);
    return { outcome: "failed" };
  } finally {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
  }

  /**
   * Write cumulative usage (steps + tokens from finish, else summed
   * step-finish). On failure paths only when the attempt did something.
   * Returns the new token total when tokens were reported.
   */
  async function recordUsage(always: boolean): Promise<number | undefined> {
    const turnUsage = finishUsage ?? stepUsage;
    if (usageRecorded || (!always && !turnUsage && stats.totalSteps === 0))
      return undefined;
    usageRecorded = true;
    const doc = await reactor.client.get<"powerhouse/chat-session">(documentId);
    const prior = doc.state.global.usage;
    const buildUsage = turnUsage
      ? {
          totalPromptTokens:
            (prior?.totalPromptTokens ?? 0) + (turnUsage.inputTokens ?? 0),
          totalCompletionTokens:
            (prior?.totalCompletionTokens ?? 0) + (turnUsage.outputTokens ?? 0),
          totalTokens:
            (prior?.totalTokens ?? 0) +
            (turnUsage.totalTokens ??
              (turnUsage.inputTokens ?? 0) + (turnUsage.outputTokens ?? 0)),
        }
      : undefined;
    await dispatch(
      updateUsageSummary({
        totalSteps: (prior?.totalSteps ?? 0) + stats.totalSteps,
        ...buildUsage,
      }),
    );
    return buildUsage?.totalTokens;
  }

  /** Close the latest assistant message of this attempt, if it is still open. */
  async function settlePartial(reason: string): Promise<void> {
    await recordUsage(false).catch((e: unknown) =>
      log?.error(`${TAG} failed to record usage:`, e),
    );
    if (!lastAssistantMsgId) return;
    const messageId = lastAssistantMsgId;
    lastAssistantMsgId = null;
    await dispatch(
      finishAssistantMessage({
        messageId,
        finishReason: reason,
        finishedAt: now(),
      }),
    );
  }

  async function failTheTurn(failure: TurnFailureInfo): Promise<void> {
    await settlePartial("error").catch((e: unknown) =>
      log?.error(`${TAG} failed to close partial message:`, e),
    );
    await dispatchFailTurn(reactor, documentId, {
      ...failure,
      userMessageId,
    }).catch((e: unknown) =>
      log?.error(`${TAG} failed to dispatch FAIL_TURN:`, e),
    );
  }
}
