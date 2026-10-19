/**
 * Compile-time type tests for the typed Reactor client.
 *
 * These files are not run by Jest — they're type-checked by `tsc` via
 * `pnpm test:types`. Failures show up as `tsc --noEmit` errors.
 */

import { expectTypeOf } from "expect-type";
import type { PHBaseState } from "document-model";
import type { ReactorContext, RegistryEntry } from "../../src/index.js";

// Minimal hand-rolled registry — doesn't depend on impl packages. The state
// shape extends PHBaseState so the `auth` / `document` fields required by
// RegistryEntry's constraint come through unchanged.
interface TestState extends PHBaseState {
  global: { name: string };
  local: Record<string, never>;
}
type TestAction = {
  id: string;
  type: "SET_NAME";
  timestampUtcMs: string;
  scope: "global";
  input: { name: string };
};
type TestRegistry = {
  "test/doc": RegistryEntry<TestState, TestAction>;
};

declare const reactor: ReactorContext<TestRegistry>;

// `get` with explicit literal type narrows to concrete document.
async function checkGet() {
  const doc = await reactor.client.get<"test/doc">("id");
  expectTypeOf(doc).toEqualTypeOf<TestRegistry["test/doc"]["document"]>();
}

// `subscribe` with literal narrows event payload.
reactor.client.subscribe<"test/doc">({ documentTypes: ["test/doc"] }, (ev) => {
  expectTypeOf(ev.documents[0]).toEqualTypeOf<
    TestRegistry["test/doc"]["document"]
  >();
});

// `execute` action input is narrowed to the document's action union.
async function checkExecute() {
  await reactor.client.execute<"test/doc">("id", "main", [
    {
      id: "a1",
      type: "SET_NAME",
      timestampUtcMs: "0",
      scope: "global",
      input: { name: "x" },
    },
  ]);
}

// Pass-through methods are inherited from IReactorClient.
expectTypeOf(reactor.client.deleteDocument).toBeFunction();
expectTypeOf(reactor.client.getJobStatus).toBeFunction();

// Without a type parameter, `get` falls back to the registry's key-union
// document — still a PHDocument, just not narrowed to a specific entry.
async function checkGetDefault() {
  const doc = await reactor.client.get("id");
  // Accept any PHDocument the registry could return.
  expectTypeOf(doc).toMatchTypeOf<
    TestRegistry[keyof TestRegistry]["document"]
  >();
}

// Keep the async helpers alive so TS doesn't flag them as unused.
void checkGet;
void checkExecute;
void checkGetDefault;
