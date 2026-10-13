/**
 * Compile-time type tests for the generic TriggerContext / TriggerOptions /
 * Trigger surface and `defineTrigger<TState, TConfig, R>`.
 *
 * Type-checked by `tsc` via `pnpm test:types`.
 */

import { expectTypeOf } from "expect-type";
import type { PHBaseState } from "document-model";
import { defineTrigger } from "../../src/index.js";
import type { RegistryEntry } from "../../src/index.js";

interface TestState extends PHBaseState {
  global: { name: string };
  local: Record<string, never>;
}

type TestRegistry = {
  "test/doc": RegistryEntry<TestState>;
};
type TestConfig = { projectId: string };

// With all three generics.
const trigger = defineTrigger<{ pending: number }, TestConfig, TestRegistry>({
  id: "t",
  type: "condition",
  state: () => ({ pending: 0 }),
  async setup(ctx) {
    expectTypeOf(ctx.state).toEqualTypeOf<{ pending: number }>();
    expectTypeOf(ctx.context.config).toEqualTypeOf<TestConfig>();
    // on/emit are optional on CoreContext, but when present they are typed.

    // Framework event payload narrowed by registry.
    ctx.context.on?.("powerhouse:document:changed", (data) => {
      expectTypeOf(data.documents).toEqualTypeOf<
        Array<TestRegistry["test/doc"]["document"]>
      >();
    });
  },
  async poll(ctx) {
    expectTypeOf(ctx.state.pending).toBeNumber();
    const reactor = await ctx.reactor();
    if (reactor) {
      const doc = await reactor.client.get<"test/doc">("id");
      expectTypeOf(doc).toEqualTypeOf<TestRegistry["test/doc"]["document"]>();
    }
    return null;
  },
});

// Return shape carries the generics back.
expectTypeOf(trigger.state).toEqualTypeOf<
  (() => { pending: number }) | undefined
>();

// Without `state` initializer, ctx.state still has the declared TState shape
// (starts as `{}` at runtime — the generic is the authoring type).
defineTrigger<{ pending: number }, TestConfig, TestRegistry>({
  id: "t2",
  type: "condition",
  async setup(ctx) {
    // @ts-expect-error — pending is number, can't assign string
    ctx.state.pending = "x";
  },
  async poll() {
    return null;
  },
});

// Defaults: no generics → loose shapes work without casts.
defineTrigger({
  id: "t3",
  type: "condition",
  async poll(ctx) {
    expectTypeOf(ctx.state).toEqualTypeOf<Record<string, unknown>>();
    expectTypeOf(ctx.context.config).toEqualTypeOf<Record<string, unknown>>();
    return null;
  },
});

void trigger;
