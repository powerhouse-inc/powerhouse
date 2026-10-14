import type { StreamChunk } from "./types.js";

// ANSI escape codes for semantic coloring of tool activity
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const RED = "\x1b[31m";
const GREEN_DIM = "\x1b[32;2m";

/**
 * Format a single StreamChunk into a display string.
 *
 * This is the framework-level formatter. The Mastra integration maps
 * Mastra's fullStream chunks to StreamChunk first, then this renders them.
 *
 * Tool activity is styled with dim green (calls/results) and red (errors)
 * so it's visually distinct from the agent's text output.
 */
export function formatStreamChunk(chunk: StreamChunk): string {
  switch (chunk.type) {
    case "text-delta":
      return chunk.text;

    case "tool-call":
      return `\n${DIM}${GREEN_DIM}▶ ${chunk.toolName}${RESET}${DIM}(${truncateArgs(chunk.args)})${RESET}\n`;

    case "tool-result":
      if (chunk.isError) {
        return `${RED}✗ ${chunk.toolName} error: ${formatResult(chunk.result)}${RESET}\n`;
      }
      // Extract text body: from { text: string } field or raw string result
      // eslint-disable-next-line no-case-declarations
      const body = hasTextField(chunk.result)
        ? (chunk.result as { text: string }).text
        : typeof chunk.result === "string"
          ? chunk.result
          : null;
      if (body && body.length > 0) {
        return `${DIM}${GREEN_DIM}✓ ${chunk.toolName}${RESET}\n${body}\n`;
      }
      // Short/null/object results: inline summary
      return `${DIM}${GREEN_DIM}✓ ${chunk.toolName}${RESET}${DIM} → ${truncateResult(chunk.result)}${RESET}\n`;

    case "tool-output":
      return chunk.text;

    case "error":
      return `${RED}Error: ${chunk.error}${RESET}\n`;

    case "step-finish":
    case "finish":
      // Lifecycle chunks carry token usage for cost accounting; no display
      // text by default. Renderers that care (eg. observability/eval) read
      // the chunk directly instead of relying on `formatted`.
      return "";
  }
}

/** A rendered stream element: the raw chunk paired with its formatted text. */
export interface RenderedChunk {
  chunk: StreamChunk;
  formatted: string;
}

/**
 * Consume a stream of StreamChunks and yield { chunk, formatted } pairs.
 *
 * Inserts an extra newline before the first text-delta after tool activity,
 * so the agent's prose is visually separated from tool call/result lines.
 */
export async function* renderStream(
  stream: AsyncGenerator<StreamChunk>,
): AsyncGenerator<RenderedChunk, void, unknown> {
  let lastChunkWasText = false;

  for await (const chunk of stream) {
    let prefix = "";
    if (chunk.type === "text-delta") {
      if (!lastChunkWasText) {
        prefix = "\n";
        lastChunkWasText = true;
      }
    } else {
      lastChunkWasText = false;
    }
    yield { chunk, formatted: prefix + formatStreamChunk(chunk) };
  }
}

function truncateArgs(args: unknown): string {
  const json = JSON.stringify(args);
  return json.length > 120 ? json.slice(0, 120) + "…" : json;
}

function truncateResult(result: unknown): string {
  const str = formatResult(result);
  return str.length > 200 ? str.slice(0, 200) + "…" : str;
}

function formatResult(result: unknown): string {
  if (result === undefined || result === null) return "ok";
  if (typeof result === "string") return result;
  return JSON.stringify(result);
}

function hasTextField(result: unknown): boolean {
  return (
    typeof result === "object" &&
    result !== null &&
    "text" in result &&
    typeof (result as Record<string, unknown>).text === "string"
  );
}
