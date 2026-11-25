/**
 * Compile-time type tests for `WrapRegistry.tool`: what a caller may pass and
 * what a wrap implementation may assume.
 *
 * Type-checked by `tsc` (the package's tsconfig includes test/types).
 */

import { expectTypeOf } from "expect-type";
import { z } from "zod";
import { createTool } from "@mastra/core/tools";
import { commandsToMastraTools } from "../../src/integrations/mastra/index.js";
import type { WrapRegistry } from "../../src/index.js";

declare const wraps: WrapRegistry;

// A Mastra tool, typed arguments and optional `execute`, goes in as it is
// and comes back with its own type.
const mastraTool = createTool({
  id: "read-note",
  description: "Read a note",
  inputSchema: z.object({ path: z.string() }),
  execute: async (input) => ({ text: input.path }),
});
expectTypeOf(wraps.tool("read-note", mastraTool)).toEqualTypeOf<
  typeof mastraTool
>();

// So does a command's tool from clint's own Mastra glue.
declare const commandTool: Awaited<
  ReturnType<typeof commandsToMastraTools>
>[string];
expectTypeOf(wraps.tool("spec-create", commandTool)).toEqualTypeOf<
  typeof commandTool
>();

// And a plain object with an `execute`.
const plain = { execute: (n: number) => n * 2 };
expectTypeOf(wraps.tool("double", plain)).toEqualTypeOf<typeof plain>();

// A wrap implementation forwards every argument, and returns a tool without
// `execute` as it is.
const forwarding: WrapRegistry["tool"] = (_name, tool) => {
  const execute = tool.execute?.bind(tool);
  if (!execute) return tool;
  return { ...tool, execute: (...args: unknown[]) => execute(...args) };
};
void forwarding;
