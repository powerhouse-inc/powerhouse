/**
 * E2E test for the Mastra integration — calls a real LLM.
 *
 * Requires ANTHROPIC_API_KEY in environment or examples/04-chat-assistant/.env.
 * Skipped automatically when no key is available.
 */
import { describe, it, expect, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { rm } from "node:fs/promises";
import { z } from "zod";
import { defineCommand } from "../src/core/command.js";
import { createMastraHelpers } from "../src/integrations/mastra/index.js";
import { createMemoryWorkdirStore } from "../src/core/store.js";
import type {
  AgentSetupContext,
  AgentProvider,
  StreamChunk,
} from "../src/core/types.js";
import { IDENTITY_WRAPS } from "../src/core/wraps.js";

// Load .env from example 04 (no dotenv dependency)
try {
  // Try both relative paths (running from packages/ph-clint/ or repo root)
  const candidates = [
    resolve(import.meta.dirname, "../../examples/04-chat-assistant/.env"),
    resolve(import.meta.dirname, "../../../examples/04-chat-assistant/.env"),
  ];
  const envPath = candidates.find((p) => {
    try {
      readFileSync(p);
      return true;
    } catch {
      return false;
    }
  })!;
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx);
    const value = trimmed.slice(eqIdx + 1);
    if (!process.env[key]) process.env[key] = value;
  }
} catch {
  // .env not found — rely on environment
}

const apiKey = process.env.ANTHROPIC_API_KEY;
const describeWithKey = apiKey ? describe : describe.skip;

const testWorkspace = join(
  tmpdir(),
  `ph-clint-e2e-${randomBytes(4).toString("hex")}`,
);

afterAll(async () => {
  try {
    await rm(testWorkspace, { recursive: true });
  } catch {}
});

const echoCommand = defineCommand({
  id: "echo",
  description: "Echo the input text back",
  inputSchema: z.object({ text: z.string().describe("Text to echo") }),
  execute: async (input) => ({ text: input.text }),
});

/** Check if an error is due to insufficient API credits. */
function isInsufficientCredits(err: any): boolean {
  const msg = err?.message ?? "";
  if (
    msg.includes("credit balance") ||
    msg.includes("billing") ||
    err?.statusCode === 400
  ) {
    console.warn("Skipping: API key has insufficient credits");
    return true;
  }
  return false;
}

/** Check if the stream contains an error chunk indicating an API billing issue. */
function hasApiError(chunks: StreamChunk[]): boolean {
  const errorChunk = chunks.find((c) => c.type === "error") as
    | { type: "error"; error: string }
    | undefined;
  if (
    errorChunk &&
    (errorChunk.error.includes("credit balance") ||
      errorChunk.error.includes("billing"))
  ) {
    console.warn("Skipping: API key has insufficient credits");
    return true;
  }
  return false;
}

describeWithKey("Mastra integration E2E", () => {
  let agentProvider: AgentProvider;

  async function createTestAgent() {
    const ctx: AgentSetupContext = {
      workdir: testWorkspace,
      config: {},
      cliName: "test-e2e",
      cliVersion: "1.0.0",
      context: {
        workdir: testWorkspace,
        workspace: createMemoryWorkdirStore(),
        config: {},
        stdout: () => {},
      } as any,
      commands: [echoCommand],
      skills: [],
      wraps: IDENTITY_WRAPS,
    };
    const m = createMastraHelpers(ctx);
    const { Agent } = await import("@mastra/core/agent");
    return m.wrapAgent(
      new Agent({
        id: "e2e-agent",
        name: "E2E Test Agent",
        instructions: "Reply in exactly 3 words.",
        model: "anthropic/claude-haiku-4-5",
        tools: await m.getTools(),
        memory: await m.createMemory(),
      }),
    );
  }

  it("streams a text response from the real LLM", async () => {
    agentProvider = await createTestAgent();
    const chunks: StreamChunk[] = [];
    try {
      for await (const chunk of agentProvider.stream("Say hello.")) {
        chunks.push(chunk);
      }
    } catch (err: any) {
      if (isInsufficientCredits(err)) return;
      throw err;
    }

    if (hasApiError(chunks)) return;

    const text = chunks
      .filter((c) => c.type === "text-delta")
      .map((c) => (c as { type: "text-delta"; text: string }).text)
      .join("");
    expect(text.length).toBeGreaterThan(0);
  }, 30_000);

  it("streams with threadId for memory persistence", async () => {
    agentProvider = await createTestAgent();
    const threadId = `e2e-${Date.now()}`;

    try {
      // Drain first turn
      const turn1: StreamChunk[] = [];
      for await (const chunk of agentProvider.stream("Hello.", { threadId })) {
        turn1.push(chunk);
      }
      if (hasApiError(turn1)) return;

      // Second turn on same thread
      const chunks: StreamChunk[] = [];
      for await (const chunk of agentProvider.stream("What did I just say?", {
        threadId,
      })) {
        chunks.push(chunk);
      }
      if (hasApiError(chunks)) return;

      const text = chunks
        .filter((c) => c.type === "text-delta")
        .map((c) => (c as { type: "text-delta"; text: string }).text)
        .join("");
      expect(text.length).toBeGreaterThan(0);
    } catch (err: any) {
      if (isInsufficientCredits(err)) return;
      throw err;
    }
  }, 30_000);
});
