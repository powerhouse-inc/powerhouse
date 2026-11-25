/**
 * Compile-time type tests for the typed Reactor client.
 *
 * These files are not run by Jest — they're type-checked by `tsc` via
 * `pnpm test:types`. Failures show up as `tsc --noEmit` errors.
 */

import { expectTypeOf } from "expect-type";
import type { IReactorClient } from "@powerhousedao/reactor";
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

// The relationship writes take IReactorClient's parameters in its order: the
// typed view is the same object, so a parameter out of place lands in the
// wrong slot at run time. Only addRelationship has `metadata` (before
// `branch`).
expectTypeOf(reactor.client.addRelationship).parameters.toEqualTypeOf<
  Parameters<IReactorClient["addRelationship"]>
>();
expectTypeOf(reactor.client.removeRelationship).parameters.toEqualTypeOf<
  Parameters<IReactorClient["removeRelationship"]>
>();
expectTypeOf(reactor.client.moveRelationship).parameters.toEqualTypeOf<
  Parameters<IReactorClient["moveRelationship"]>
>();

async function checkAddRelationshipBranch() {
  await reactor.client.addRelationship("a", "b", "child", undefined, "draft");
  // @ts-expect-error -- the fourth argument is the metadata, not the branch
  await reactor.client.addRelationship("a", "b", "child", "draft");
}

// Keep the async helpers alive so TS doesn't flag them as unused.
void checkGet;
void checkExecute;
void checkGetDefault;
void checkAddRelationshipBranch;
