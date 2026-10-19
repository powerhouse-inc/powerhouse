/**
 * Compile-time type tests for the createTypes() binding helper.
 *
 * Type-checked by `tsc` via `pnpm test:types`.
 */

import { expectTypeOf } from "expect-type";
import { z } from "zod";
import type { PHBaseState } from "document-model";
import { createTypes } from "../../src/index.js";
import type { RegistryEntry } from "../../src/index.js";

// Hand-rolled registry matching what `defineRegistry([...] as const)` would
// produce — avoids depending on an impl package from a type-only test.
interface FakeState extends PHBaseState {
  global: { foo: string };
  local: Record<string, never>;
}
type FakeRegistry = {
  "test/fake": RegistryEntry<FakeState>;
};

const configSchema = z.object({ port: z.number(), host: z.string() });
declare const registry: FakeRegistry;

const { defineCommand, defineTrigger, defineService } = createTypes({
  configSchema,
  registry,
});

// defineCommand: ctx.config typed.
defineCommand({
  id: "c",
  description: "",
  inputSchema: z.object({ x: z.string() }),
  async execute(input, ctx) {
    expectTypeOf(ctx.config).toEqualTypeOf<{ port: number; host: string }>();
    expectTypeOf(input.x).toBeString();
    return null;
  },
});

// defineTrigger: only TState needs to be declared at call site. TConfig and
// R come from the binding.
defineTrigger<{ count: number }>({
  id: "t",
  type: "condition",
  state: () => ({ count: 0 }),
  async setup(ctx) {
    expectTypeOf(ctx.state.count).toBeNumber();
    expectTypeOf(ctx.context.config).toEqualTypeOf<{
      port: number;
      host: string;
    }>();

    // Registry-typed event payload.
    ctx.context.on?.("powerhouse:document:changed", (data) => {
      expectTypeOf(data.documents).toEqualTypeOf<
        Array<FakeRegistry["test/fake"]["document"]>
      >();
    });
  },
  async poll(ctx) {
    const reactor = await ctx.reactor();
    if (reactor) {
      const doc = await reactor.client.get<"test/fake">("id");
      expectTypeOf(doc).toEqualTypeOf<FakeRegistry["test/fake"]["document"]>();
    }
    return null;
  },
});

// defineService: config typed in env/preflight.
defineService({
  id: "s",
  command: "my-cmd",
  env: ({ config }) => {
    expectTypeOf(config).toEqualTypeOf<{ port: number; host: string }>();
    return { PORT: String(config.port) };
  },
});

// Without a registry, AnyRegistry is the default — still works, just loose.
const { defineTrigger: defineTriggerNoR } = createTypes({ configSchema });
defineTriggerNoR({
  id: "no-reg",
  type: "condition",
  async poll(ctx) {
    expectTypeOf(ctx.context.config).toEqualTypeOf<{
      port: number;
      host: string;
    }>();
    return null;
  },
});
