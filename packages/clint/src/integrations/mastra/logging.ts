import { mkdirSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import type { StreamChunk } from "../../core/types.js";

/**
 * Strings longer than this in a tool result are summarized rather than
 * written verbatim. Multimodal MCP tool results (mcp >=1.9) carry image /
 * audio payloads as base64 content parts; dumping them raw would bloat the
 * markdown log with unreadable blobs.
 */
const MAX_LOGGED_STRING = 512;

/**
 * Serialize a tool result for the markdown log, collapsing large binary /
 * base64 payloads (e.g. multimodal content parts) into a compact placeholder.
 * Falls back to `String(result)` if the value isn't JSON-serializable.
 */
function summarizeToolResult(result: unknown): string {
  try {
    return JSON.stringify(
      result,
      (_key, value) => {
        if (value instanceof Uint8Array) {
          return `[binary, ~${(value.byteLength / 1024).toFixed(1)} KB omitted]`;
        }
        if (typeof value === "string" && value.length > MAX_LOGGED_STRING) {
          const mediaType = /^data:([^;,]+)/.exec(value)?.[1] ?? "string";
          return `[${mediaType}, ~${(value.length / 1024).toFixed(1)} KB omitted]`;
        }
        return value;
      },
      2,
    );
  } catch {
    return String(result);
  }
}

// ── Types ────────────────────────────────────────────────────────

/**
 * Interface for logging agent conversations to disk.
 *
 * Framework-agnostic — works with any agent provider that produces
 * StreamChunks (Mastra, raw Anthropic SDK, etc.).
 */
export interface IConversationLogger {
  startSession(
    sessionId: string,
    agentId: string,
    agentName?: string,
    instructions?: string,
  ): void;
  endSession(sessionId: string): void;
  logUserMessage(sessionId: string, message: string): void;
  logAssistantMessage(sessionId: string, message: string): void;
  logToolUse(
    sessionId: string,
    toolName: string,
    args: unknown,
    toolCallId?: string,
  ): void;
  logToolResult(
    sessionId: string,
    toolName: string,
    result: unknown,
    isError?: boolean,
    toolCallId?: string,
  ): void;
  logError(sessionId: string, error: string): void;
  cleanup(): void;
}

// ── Session state ────────────────────────────────────────────────

interface SessionState {
  filePath: string;
  startTime: Date;
  agentName?: string;
  isActive: boolean;
  messageCount: number;
  toolUseCount: number;
}

// ── Options ──────────────────────────────────────────────────────

export interface ConversationLoggerOptions {
  /** Base directory for log files. */
  directory: string;
}

// ── MarkdownConversationLogger ───────────────────────────────────

/**
 * Append-only markdown logger that writes one file per session.
 *
 * File layout:  {directory}/{agentName}/{YYYYMMDD_HHMM_NNN}.md
 */
export class MarkdownConversationLogger implements IConversationLogger {
  private sessions = new Map<string, SessionState>();
  private agentCounters = new Map<string, number>();
  private readonly directory: string;

  constructor(options: ConversationLoggerOptions) {
    this.directory = options.directory;
  }

  // ── Session lifecycle ────────────────────────────────────────

  startSession(
    sessionId: string,
    agentId: string,
    agentName?: string,
    instructions?: string,
  ): void {
    if (this.sessions.has(sessionId)) return;

    const now = new Date();
    const ts = `${now.getFullYear()}${p2(now.getMonth() + 1)}${p2(now.getDate())}_${p2(now.getHours())}${p2(now.getMinutes())}`;

    const agentDir = (agentName ?? agentId).replace(/\s+/g, "");
    const counter = (this.agentCounters.get(agentDir) ?? 0) + 1;
    this.agentCounters.set(agentDir, counter);

    const filename = `${ts}_${String(counter).padStart(3, "0")}.md`;
    const fullDir = join(this.directory, agentDir);
    const filePath = join(fullDir, filename);

    mkdirSync(fullDir, { recursive: true });

    const startTime = new Date();
    this.sessions.set(sessionId, {
      filePath,
      startTime,
      agentName,
      isActive: true,
      messageCount: 0,
      toolUseCount: 0,
    });

    let header =
      `# Session: ${agentName ?? agentId}\n` +
      `**Session ID**: ${sessionId}\n` +
      `**Agent**: ${agentId}\n` +
      `**Started**: ${startTime.toISOString()}\n\n`;

    if (instructions) {
      header += `# System Prompt\n\`\`\`\`md\n${instructions}\n\`\`\`\`\n\n`;
    }

    appendFileSync(filePath, header);
  }

  endSession(sessionId: string): void {
    const s = this.sessions.get(sessionId);
    if (!s?.isActive) return;

    const endTime = new Date();
    const duration = endTime.getTime() - s.startTime.getTime();

    appendFileSync(
      s.filePath,
      `\n# Session Summary\n` +
        `**Ended**: ${endTime.toISOString()}\n` +
        `**Duration**: ${formatDuration(duration)}\n` +
        `**Messages**: ${s.messageCount}\n` +
        `**Tool Uses**: ${s.toolUseCount}\n`,
    );
    s.isActive = false;
  }

  // ── Conversation events ──────────────────────────────────────

  logUserMessage(sessionId: string, message: string): void {
    const s = this.sessions.get(sessionId);
    if (!s?.isActive) return;

    if (s.messageCount === 0) {
      appendFileSync(s.filePath, "# Conversation Log\n\n");
    }

    appendFileSync(
      s.filePath,
      `## User Message\n` +
        `**Time**: ${new Date().toISOString()}\n` +
        `\`\`\`\`md\n${message}\n\`\`\`\`\n\n`,
    );
    s.messageCount++;
  }

  logAssistantMessage(sessionId: string, message: string): void {
    const s = this.sessions.get(sessionId);
    if (!s?.isActive) return;

    appendFileSync(
      s.filePath,
      `## Assistant Message\n` +
        `**Time**: ${new Date().toISOString()}\n` +
        `\`\`\`\`md\n${message}\n\`\`\`\`\n\n`,
    );
    s.messageCount++;
  }

  logToolUse(
    sessionId: string,
    toolName: string,
    args: unknown,
    toolCallId?: string,
  ): void {
    const s = this.sessions.get(sessionId);
    if (!s?.isActive) return;

    const idLine = toolCallId ? `**Call ID**: ${toolCallId}\n` : "";
    appendFileSync(
      s.filePath,
      `## Tool Use: ${toolName}\n` +
        `**Time**: ${new Date().toISOString()}\n` +
        idLine +
        `**Input**:\n\`\`\`\`json\n${JSON.stringify(args, null, 2)}\n\`\`\`\`\n\n`,
    );
    s.toolUseCount++;
  }

  logToolResult(
    sessionId: string,
    toolName: string,
    result: unknown,
    isError?: boolean,
    toolCallId?: string,
  ): void {
    const s = this.sessions.get(sessionId);
    if (!s?.isActive) return;

    const idLine = toolCallId ? `**Call ID**: ${toolCallId}\n` : "";
    let content = `## Tool Result: ${toolName}\n**Time**: ${new Date().toISOString()}\n${idLine}`;
    if (isError) {
      content += `**Error**: ${String(result)}\n`;
    } else {
      content += `**Output**:\n\`\`\`\`json\n${summarizeToolResult(result)}\n\`\`\`\`\n`;
    }
    appendFileSync(s.filePath, content + "\n");
  }

  logError(sessionId: string, error: string): void {
    const s = this.sessions.get(sessionId);
    if (!s?.isActive) return;

    appendFileSync(
      s.filePath,
      `## Error\n**Time**: ${new Date().toISOString()}\n**Message**: ${error}\n\n`,
    );
  }

  cleanup(): void {
    for (const [id, s] of this.sessions) {
      if (s.isActive) this.endSession(id);
    }
    this.sessions.clear();
  }
}

// ── Stream logging wrapper ───────────────────────────────────────

/**
 * Wrap an agent stream generator to log every chunk to a conversation logger.
 *
 * Text-delta chunks are accumulated and flushed as an assistant message
 * whenever a non-text chunk arrives (tool-call, tool-result, error), and
 * again when the stream ends. This preserves the interleaved order of
 * text and tool activity in the log, matching the interactive output.
 */
export async function* loggedStream(
  stream: AsyncGenerator<StreamChunk>,
  logger: IConversationLogger,
  sessionId: string,
): AsyncGenerator<StreamChunk> {
  const textParts: string[] = [];

  function flushText(): void {
    if (textParts.length > 0) {
      logger.logAssistantMessage(sessionId, textParts.join(""));
      textParts.length = 0;
    }
  }

  try {
    for await (const chunk of stream) {
      switch (chunk.type) {
        case "text-delta":
          textParts.push(chunk.text);
          break;
        case "tool-call":
          flushText();
          logger.logToolUse(
            sessionId,
            chunk.toolName,
            chunk.args,
            chunk.toolCallId,
          );
          break;
        case "tool-result":
          flushText();
          logger.logToolResult(
            sessionId,
            chunk.toolName,
            chunk.result,
            chunk.isError,
            chunk.toolCallId,
          );
          break;
        case "error":
          flushText();
          logger.logError(sessionId, chunk.error);
          break;
      }
      yield chunk;
    }
  } finally {
    // Flush any remaining text (final assistant message or interrupted stream)
    flushText();
  }
}

// ── Helpers ──────────────────────────────────────────────────────

function p2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m ${s % 60}s`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}
