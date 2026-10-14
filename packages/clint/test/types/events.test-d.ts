/**
 * Compile-time type tests for the typed event bus.
 *
 * These files are not run by Jest — they're type-checked by `tsc` via
 * `pnpm test:types`. Failures show up as `tsc --noEmit` errors.
 */

import { expectTypeOf } from "expect-type";
import type { PHBaseState } from "document-model";
import type { OnFn, EmitFn, RegistryEntry } from "../../src/index.js";

// Minimal state extending PHBaseState — the framework constraint only
// requires `auth` and `document`. Add `global` / `local` to mimic a
// typical document state shape.
interface TestState extends PHBaseState {
  global: { name: string };
  local: Record<string, never>;
}

type TestRegistry = {
  "test/doc": RegistryEntry<TestState>;
};

declare const on: OnFn<TestRegistry>;
declare const emit: EmitFn<TestRegistry>;

// Framework events are typed.
on("powerhouse:document:changed", (data) => {
  expectTypeOf(data.changeType).toEqualTypeOf<"updated">();
  expectTypeOf(data.documents).toEqualTypeOf<
    Array<TestRegistry["test/doc"]["document"]>
  >();
});

on("powerhouse:document:created", (data) => {
  expectTypeOf(data.documentType).toEqualTypeOf<"test/doc">();
});

on("powerhouse:document:deleted", (data) => {
  expectTypeOf(data.documentId).toBeString();
});

// User events fall through to `unknown`.
on("my:custom:event", (data) => {
  expectTypeOf(data).toEqualTypeOf<unknown>();
});

// emit enforces framework event payloads (positive case).
emit("powerhouse:document:changed", {
  changeType: "updated",
  documents: [],
});

// Note: the overload signature of EmitFn intentionally falls through to
// `(event: string, data?: unknown) => void` for unrecognized payload shapes,
// so `emit('powerhouse:document:created', { foo: 'bar' })` does NOT produce
// a compile error — it matches the second overload. Negative tests for
// framework-event payload shape aren't enforceable without changing the
// signature to a single mapped-type overload (would be a phase 2+ change).
