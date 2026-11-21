import { defineCommand } from "@powerhousedao/clint";
import { z } from "zod";

// The commands every fixture Cli carries: one that prints, one that fails,
// and one that reads a document through the reactor the runner supplies.

export const hello = defineCommand({
  id: "hello",
  description: "Print a greeting",
  inputSchema: z.object({ name: z.string().describe("Who to greet") }),
  execute: ({ name }) => Promise.resolve(`Hello, ${name}!`),
});

export const fail = defineCommand({
  id: "fail",
  description: "Always fails",
  inputSchema: z.object({}),
  execute: () => Promise.reject(new Error("intentional failure")),
});

export const readDocument = defineCommand({
  id: "read-doc",
  description: "Read a document through the reactor client",
  inputSchema: z.object({ id: z.string().describe("The document's id") }),
  positional: ["id"],
  execute: async ({ id }, ctx) => {
    const reactor = await ctx.reactor?.();
    if (!reactor) throw new Error("No reactor: run this Cli from its host.");
    const document = await reactor.client.get(id);
    return `read ${document.header.id} ${document.header.documentType} (drive ${reactor.driveId})`;
  },
});

export const members = defineCommand({
  id: "members",
  description: "List the services the Cli sees, its stack's members among them",
  inputSchema: z.object({}),
  execute: (_, ctx) =>
    Promise.resolve(
      (ctx.services?.list() ?? [])
        .map((service) =>
          [
            service.serviceId,
            service.status,
            ...Object.entries(service.endpoints ?? {}).map(
              ([key, url]) => `${key}=${url}`,
            ),
          ].join(" "),
        )
        .join("\n") || "no services",
    ),
});

export const commands = [hello, fail, readDocument, members];
