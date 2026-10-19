import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  existsSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  MarkdownConversationLogger,
  loggedStream,
} from "../src/integrations/mastra/logging.js";
import type { StreamChunk } from "../src/core/types.js";

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), "ph-clint-log-"));
}

function cleanup(dir: string) {
  rmSync(dir, { recursive: true, force: true });
}

describe("MarkdownConversationLogger", () => {
  let dir: string;
  let logger: MarkdownConversationLogger;

  beforeEach(() => {
    dir = makeTmpDir();
    logger = new MarkdownConversationLogger({ directory: dir });
  });

  afterEach(() => cleanup(dir));

  it("creates a session file with header", () => {
    logger.startSession("s1", "my-agent", "My Agent");

    const files = findLogFiles(dir);
    expect(files).toHaveLength(1);

    const content = readFileSync(files[0]!, "utf8");
    expect(content).toContain("# Session: My Agent");
    expect(content).toContain("**Session ID**: s1");
    expect(content).toContain("**Agent**: my-agent");
    expect(content).toContain("**Started**:");
  });

  it("uses agentId when agentName is not provided", () => {
    logger.startSession("s1", "fallback-agent");

    const files = findLogFiles(dir);
    const content = readFileSync(files[0]!, "utf8");
    expect(content).toContain("# Session: fallback-agent");
  });

  it("logs system prompt / instructions when provided", () => {
    logger.startSession("s1", "a", "Agent", "You are a helpful assistant.");

    const content = readLogContent(dir);
    expect(content).toContain("# System Prompt");
    expect(content).toContain("You are a helpful assistant.");
  });

  it("omits system prompt section when instructions not provided", () => {
    logger.startSession("s1", "a", "Agent");

    const content = readLogContent(dir);
    expect(content).not.toContain("# System Prompt");
  });

  it("ignores duplicate startSession calls", () => {
    logger.startSession("s1", "a");
    logger.startSession("s1", "a");

    const files = findLogFiles(dir);
    expect(files).toHaveLength(1);
  });

  it("logs user messages", () => {
    logger.startSession("s1", "a");
    logger.logUserMessage("s1", "Hello agent");

    const content = readLogContent(dir);
    expect(content).toContain("# Conversation Log");
    expect(content).toContain("## User Message");
    expect(content).toContain("Hello agent");
  });

  it("logs assistant messages", () => {
    logger.startSession("s1", "a");
    logger.logAssistantMessage("s1", "Hello user");

    const content = readLogContent(dir);
    expect(content).toContain("## Assistant Message");
    expect(content).toContain("Hello user");
  });

  it("logs tool use", () => {
    logger.startSession("s1", "a");
    logger.logToolUse("s1", "get_weather", { location: "Paris" });

    const content = readLogContent(dir);
    expect(content).toContain("## Tool Use: get_weather");
    expect(content).toContain('"location": "Paris"');
  });

  it("logs tool result", () => {
    logger.startSession("s1", "a");
    logger.logToolResult("s1", "get_weather", { temp: 22 });

    const content = readLogContent(dir);
    expect(content).toContain("## Tool Result: get_weather");
    expect(content).toContain('"temp": 22');
  });

  it("logs tool error", () => {
    logger.startSession("s1", "a");
    logger.logToolResult("s1", "bad_tool", "connection failed", true);

    const content = readLogContent(dir);
    expect(content).toContain("**Error**: connection failed");
  });

  it("summarizes large base64 payloads in multimodal tool results", () => {
    logger.startSession("s1", "a");
    const bigB64 = "A".repeat(5000);
    logger.logToolResult("s1", "screenshot", {
      content: [
        { type: "text", text: "here is the image" },
        { type: "image", mimeType: "image/png", data: bigB64 },
      ],
    });

    const content = readLogContent(dir);
    // Small text part is preserved verbatim…
    expect(content).toContain("here is the image");
    // …while the base64 blob is collapsed to a size placeholder, not dumped.
    expect(content).not.toContain(bigB64);
    expect(content).toContain("KB omitted]");
  });

  it("extracts the media type from a data: URI tool result", () => {
    logger.startSession("s1", "a");
    logger.logToolResult(
      "s1",
      "render",
      `data:image/jpeg;base64,${"B".repeat(1000)}`,
    );

    const content = readLogContent(dir);
    expect(content).toContain("[image/jpeg, ~");
  });

  it("logs errors", () => {
    logger.startSession("s1", "a");
    logger.logError("s1", "Something went wrong");

    const content = readLogContent(dir);
    expect(content).toContain("## Error");
    expect(content).toContain("Something went wrong");
  });

  it("writes session summary on endSession", () => {
    logger.startSession("s1", "a");
    logger.logUserMessage("s1", "hi");
    logger.logToolUse("s1", "tool1", {});
    logger.logToolUse("s1", "tool2", {});
    logger.logAssistantMessage("s1", "done");
    logger.endSession("s1");

    const content = readLogContent(dir);
    expect(content).toContain("# Session Summary");
    expect(content).toContain("**Messages**: 2");
    expect(content).toContain("**Tool Uses**: 2");
    expect(content).toContain("**Duration**:");
  });

  it("does not log to ended sessions", () => {
    logger.startSession("s1", "a");
    logger.endSession("s1");
    logger.logUserMessage("s1", "should not appear");

    const content = readLogContent(dir);
    expect(content).not.toContain("should not appear");
  });

  it("does not log to unknown sessions", () => {
    // Should not throw
    logger.logUserMessage("unknown", "nope");
    logger.logAssistantMessage("unknown", "nope");
    logger.logToolUse("unknown", "x", {});
    logger.logToolResult("unknown", "x", {});
    logger.logError("unknown", "nope");
    logger.endSession("unknown");
  });

  it("increments file counter per agent", () => {
    logger.startSession("s1", "a", "Agent");
    logger.startSession("s2", "a", "Agent");

    const files = findLogFiles(dir);
    expect(files).toHaveLength(2);
    expect(files.some((f) => f.includes("_001.md"))).toBe(true);
    expect(files.some((f) => f.includes("_002.md"))).toBe(true);
  });

  it("cleanup ends all active sessions", () => {
    logger.startSession("s1", "a");
    logger.startSession("s2", "a");
    logger.logUserMessage("s1", "msg");
    logger.cleanup();

    const files = findLogFiles(dir);
    for (const f of files) {
      const content = readFileSync(f, "utf8");
      expect(content).toContain("# Session Summary");
    }
  });

  it("does not write Conversation Log header on second user message", () => {
    logger.startSession("s1", "a");
    logger.logUserMessage("s1", "first");
    logger.logUserMessage("s1", "second");

    const content = readLogContent(dir);
    // "# Conversation Log" should appear exactly once
    const matches = content.match(/# Conversation Log/g);
    expect(matches).toHaveLength(1);
  });

  it("ignores double endSession calls", () => {
    logger.startSession("s1", "a");
    logger.endSession("s1");
    // Should not throw or write duplicate summaries
    logger.endSession("s1");

    const content = readLogContent(dir);
    const matches = content.match(/# Session Summary/g);
    expect(matches).toHaveLength(1);
  });

  it("formats long durations with hours", () => {
    logger.startSession("s1", "a");
    // Hack: modify startTime to be >1 hour ago
    const session = (logger as any).sessions.get("s1");
    session.startTime = new Date(Date.now() - 3661000); // 1h 1m 1s
    logger.endSession("s1");

    const content = readLogContent(dir);
    expect(content).toMatch(/\d+h \d+m \d+s/);
  });

  it("writes to agent-specific subdirectories", () => {
    logger.startSession("s1", "agent-a", "Alpha Agent");
    logger.startSession("s2", "agent-b", "Beta Agent");

    expect(existsSync(join(dir, "AlphaAgent"))).toBe(true);
    expect(existsSync(join(dir, "BetaAgent"))).toBe(true);
  });
});

describe("loggedStream", () => {
  let dir: string;
  let logger: MarkdownConversationLogger;

  beforeEach(() => {
    dir = makeTmpDir();
    logger = new MarkdownConversationLogger({ directory: dir });
  });

  afterEach(() => cleanup(dir));

  it("passes through all chunks and logs them", async () => {
    logger.startSession("s1", "a");
    logger.logUserMessage("s1", "test");

    const chunks: StreamChunk[] = [
      { type: "text-delta", text: "Hello" },
      { type: "text-delta", text: " world" },
      { type: "tool-call", toolName: "greet", args: { name: "Alice" } },
      {
        type: "tool-result",
        toolName: "greet",
        result: "Hi Alice",
        isError: false,
      },
      { type: "text-delta", text: "!" },
    ];

    const collected: StreamChunk[] = [];
    for await (const chunk of loggedStream(fakeStream(chunks), logger, "s1")) {
      collected.push(chunk);
    }

    // All chunks passed through
    expect(collected).toEqual(chunks);

    // Check log content — text is flushed before tool activity and at the end,
    // so 'Hello world' and '!' are logged as separate assistant messages.
    const content = readLogContent(dir);
    expect(content).toContain("## Assistant Message");
    expect(content).toContain("Hello world");
    expect(content).toContain("!");
    expect(content).toContain("## Tool Use: greet");
    expect(content).toContain("## Tool Result: greet");

    // Verify interleaved order: text before tool use, tool use before tool result, text after
    const textIdx = content.indexOf("Hello world");
    const toolUseIdx = content.indexOf("## Tool Use: greet");
    const toolResultIdx = content.indexOf("## Tool Result: greet");
    const trailingTextIdx = content.indexOf("!", toolResultIdx);
    expect(textIdx).toBeLessThan(toolUseIdx);
    expect(toolUseIdx).toBeLessThan(toolResultIdx);
    expect(toolResultIdx).toBeLessThan(trailingTextIdx);
  });

  it("logs error chunks", async () => {
    logger.startSession("s1", "a");

    const chunks: StreamChunk[] = [{ type: "error", error: "something broke" }];

    for await (const _ of loggedStream(fakeStream(chunks), logger, "s1")) {
      // consume
    }

    const content = readLogContent(dir);
    expect(content).toContain("## Error");
    expect(content).toContain("something broke");
  });

  it("logs assistant message even if stream throws after partial output", async () => {
    logger.startSession("s1", "a");

    async function* failingStream(): AsyncGenerator<StreamChunk> {
      yield { type: "text-delta", text: "partial" };
      throw new Error("stream died");
    }

    const collected: StreamChunk[] = [];
    await expect(async () => {
      for await (const chunk of loggedStream(failingStream(), logger, "s1")) {
        collected.push(chunk);
      }
    }).rejects.toThrow("stream died");

    expect(collected).toHaveLength(1);

    // The finally block should still log the partial text
    const content = readLogContent(dir);
    expect(content).toContain("partial");
  });
});

// ── Helpers ──────────────────────────────────────────────────────

async function* fakeStream(chunks: StreamChunk[]): AsyncGenerator<StreamChunk> {
  for (const c of chunks) yield c;
}

function findLogFiles(dir: string): string[] {
  const results: string[] = [];
  function walk(d: string) {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".md")) results.push(full);
    }
  }
  walk(dir);
  return results.sort();
}

function readLogContent(dir: string): string {
  const files = findLogFiles(dir);
  if (files.length === 0) throw new Error("No log files found");
  return readFileSync(files[0]!, "utf8");
}
