import { writeFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { defineCli, defineCommand, defineTrigger } from "@powerhousedao/clint";
import { z } from "zod";

// A Cli that keeps running, with commands that need what it holds: typed in
// another process they run here. Each says which process ran it.

const needs = "reactor";

const where = defineCommand({
  id: "where",
  description: "Say which process runs the command, and for whom",
  needs,
  inputSchema: z.object({}),
  execute: (_, ctx) =>
    Promise.resolve(
      `ran in pid ${process.pid} for pid ${ctx.caller?.pid ?? "none"} user ${ctx.caller?.user ?? "none"} tty ${ctx.caller?.tty ?? "none"} identity ${ctx.caller?.identity ? "given" : "none"}`,
    ),
});

const here = defineCommand({
  id: "here",
  description: "A command that needs nothing of a running instance",
  inputSchema: z.object({}),
  execute: () => Promise.resolve(`ran in pid ${process.pid}`),
});

const stream = defineCommand({
  id: "stream",
  description: "Write to both streams over time",
  needs,
  inputSchema: z.object({
    count: z.coerce.number().int().default(3).describe("How many lines"),
    tag: z.string().default("line").describe("What each line starts with"),
  }),
  execute: async ({ count, tag }, ctx) => {
    for (let i = 1; i <= count; i++) {
      ctx.stdout(`${tag} out ${i} at ${Date.now()}\n`);
      ctx.log.warn(`${tag} err ${i}`);
      await sleep(150);
    }
    return `${tag} done`;
  },
});

const loud = defineCommand({
  id: "loud",
  description: "Print straight to the process, past the command's context",
  needs,
  inputSchema: z.object({
    count: z.coerce.number().int().default(3).describe("How many rounds"),
    tag: z.string().default("loud").describe("What each line starts with"),
  }),
  execute: async ({ count, tag }, ctx) => {
    for (let i = 1; i <= count; i++) {
      console.log(`${tag} log ${i} at ${Date.now()}`);
      process.stdout.write(`${tag} write ${i}\n`);
      console.error(`${tag} error ${i}`);
      process.stderr.write(Buffer.from(`${tag} bytes ${i}\n`));
      await sleep(100);
    }
    // The instance's own reaction prints where the instance prints.
    ctx.emit?.("fixture:loud", tag);
    // Work left running prints on the instance once the command ended.
    setTimeout(() => console.log(`${tag} after the end`), 300);
    return `${tag} done`;
  },
});

const wait = defineCommand({
  id: "wait",
  description: "Run until cancelled, then leave a note",
  needs,
  inputSchema: z.object({
    note: z.string().describe("The file the end is noted in"),
  }),
  execute: async ({ note }, ctx) => {
    ctx.stdout("waiting\n");
    const file = path.join(process.env.FIXTURE_NOTES ?? ".", note);
    try {
      await sleep(120_000, undefined, { signal: ctx.signal });
    } catch {
      writeFileSync(file, `cancelled in pid ${process.pid}`);
      throw new Error("cancelled");
    }
    writeFileSync(file, "ran to its end");
    return "waited";
  },
});

const boom = defineCommand({
  id: "boom",
  description: "Fail with an exit code of its own",
  needs,
  inputSchema: z.object({}),
  execute: () =>
    Promise.reject(
      Object.assign(new Error("boom in the host"), { exitCode: 7 }),
    ),
});

const eat = defineCommand({
  id: "eat",
  description: "Read the text given, or what is piped in",
  needs,
  stdin: (input) => !input.text,
  inputSchema: z.object({
    text: z.string().optional().describe("The text, instead of piped input"),
  }),
  execute: async ({ text }, ctx) => {
    const eaten = text ?? (await ctx.readStdin?.());
    return `ate ${JSON.stringify(eaten)} in pid ${process.pid}`;
  },
});

const sneak = defineCommand({
  id: "sneak",
  description: "Read piped input without declaring it",
  needs,
  inputSchema: z.object({}),
  execute: async (_, ctx) => `ate ${JSON.stringify(await ctx.readStdin?.())}`,
});

const count = defineCommand({
  id: "count",
  description: "Take a number",
  needs,
  inputSchema: z.object({ n: z.number().describe("A number") }),
  execute: ({ n }) => Promise.resolve(`counted ${n}`),
});

const ask = defineCommand({
  id: "ask",
  description: "Ask the agent",
  needs: "agent",
  inputSchema: z.object({ question: z.string().describe("The question") }),
  positional: ["question"],
  execute: async ({ question }, ctx) => {
    const agent = await ctx.agent?.();
    if (!agent) throw new Error("no agent");
    let answer = "";
    for await (const chunk of agent.stream(question, {
      abortSignal: ctx.signal,
    })) {
      if (chunk.type === "text-delta") answer += chunk.text;
    }
    return `${agent.id} said: ${answer}`;
  },
});

const idle = defineTrigger({
  id: "idle",
  type: "poll",
  poll: () => Promise.resolve(null),
});

export const cli = defineCli({
  name: "fixture-forward",
  version: "0.0.1",
  description: "A serving Cli whose commands run in it",
  commands: [where, here, stream, loud, wait, boom, eat, sneak, count, ask],
  events: {
    "fixture:loud": (tag) => console.log(`the instance heard ${tag}`),
  },
  triggers: [idle],
  routine: { tickInterval: 200 },
});

// An agent with no model: it answers from the process it was built in.
cli.configureAgent(() =>
  Promise.resolve({
    id: "fake-agent",
    async *stream(prompt) {
      yield { type: "text-delta", text: `echo from pid ${process.pid}: ` };
      yield { type: "text-delta", text: String(prompt) };
    },
  }),
);
