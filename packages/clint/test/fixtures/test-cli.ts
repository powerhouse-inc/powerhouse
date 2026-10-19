import { z } from "zod";
import { defineCommand } from "../../src/core/command.js";
import { defineCli } from "../../src/core/cli.js";

const greet = defineCommand({
  id: "greet",
  description: "Greet someone",
  inputSchema: z.object({
    name: z.string().describe("Name to greet"),
    loud: z.boolean().default(false).describe("Shout the greeting"),
  }),
  execute: async ({ name, loud }) => {
    const msg = `Hello, ${name}!`;
    return loud ? msg.toUpperCase() : msg;
  },
});

const noop = defineCommand({
  id: "noop",
  description: "Return nothing",
  inputSchema: z.object({}),
  execute: async () => undefined,
});

const fail = defineCommand({
  id: "fail",
  description: "Always fails",
  inputSchema: z.object({}),
  execute: async () => {
    throw new Error("intentional failure");
  },
});

const cli = defineCli({
  name: "test-fixture",
  version: "0.0.1",
  description: "Test fixture CLI",
  commands: [greet, noop, fail],
});

cli.run(process.argv);
