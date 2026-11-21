import { defineCli, defineCommand } from "@powerhousedao/clint";
import { z } from "zod";

// One command that prints, and one that reads a document through the reactor
// the Cli runner supplies.
const hello = defineCommand({
  id: "hello",
  description: "Print a greeting",
  inputSchema: z.object({ name: z.string().describe("Who to greet") }),
  execute: ({ name }) => Promise.resolve(`Hello, ${name}!`),
});

const readDocument = defineCommand({
  id: "read-doc",
  description: "Read a document through the reactor client",
  inputSchema: z.object({ id: z.string().describe("The document's id") }),
  positional: ["id"],
  execute: async ({ id }, ctx) => {
    const reactor = await ctx.reactor?.();
    if (!reactor) throw new Error("No reactor: run this Cli from its host.");
    const document = await reactor.client.get(id);
    return `${document.header.id} ${document.header.documentType}`;
  },
});

export const cli = defineCli({
  name: "fixture-cli",
  version: "1.0.0",
  description: "A package's Cli, as its ./cli export",
  commands: [hello, readDocument],
});
