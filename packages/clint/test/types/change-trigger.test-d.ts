/**
 * Compile-time type tests for `createDocumentChangeTrigger`.
 *
 * Checked by `tsc --noEmit` via `pnpm test:types`.
 */

import { expectTypeOf } from "expect-type";
import { z } from "zod";
import type { PHBaseState } from "document-model";
import {
  createDocumentChangeTrigger,
  createTypes,
  isDocType,
} from "../../src/index.js";
import type { RegistryEntry } from "../../src/index.js";
import type { PHDocument } from "document-model";

interface DocState extends PHBaseState {
  global: { name: string };
  local: Record<string, never>;
}
interface OtherState extends PHBaseState {
  global: { count: number };
  local: Record<string, never>;
}

type TestRegistry = {
  "test/doc": RegistryEntry<DocState>;
  "test/other": RegistryEntry<OtherState>;
};

// ── Direct form (no binding) ─────────────────────────────────────

// onChange receives an array of correctly narrowed docs.
createDocumentChangeTrigger<TestRegistry, "test/doc">({
  id: "t1",
  documentType: "test/doc",
  async onChange(docs) {
    expectTypeOf(docs).toBeArray();
    const [doc] = docs;
    expectTypeOf(doc.state.global.name).toBeString();
    // @ts-expect-error — 'test/doc' global has no `count` field
    void doc.state.global.count;
    return null;
  },
});

// Unregistered documentType is a type error — surfaces on the generic arg.
createDocumentChangeTrigger<
  TestRegistry,
  // @ts-expect-error — 'test/unknown' is not a key of TestRegistry
  "test/unknown"
>({
  id: "t2",
  documentType: "test/unknown" as never,
  async onChange() {
    return null;
  },
});

// Without the generic hint, passing a string literal that isn't in the
// registry is caught on the `documentType` field by inference.
createDocumentChangeTrigger<TestRegistry>({
  id: "t2b",
  // @ts-expect-error — 'test/unknown' not a key of TestRegistry
  documentType: "test/unknown",
  async onChange() {
    return null;
  },
});

// documentId function receives the full typed trigger context.
createDocumentChangeTrigger<TestRegistry, "test/doc">({
  id: "t3",
  documentType: "test/doc",
  documentId: async (ctx) => {
    // ctx.state has the default { pending: number } shape here.
    expectTypeOf(ctx.state.pending).toBeNumber();
    return "some-id";
  },
  async onChange() {
    return null;
  },
});

// filter receives a narrowed doc.
createDocumentChangeTrigger<TestRegistry, "test/other">({
  id: "t4",
  documentType: "test/other",
  filter: (doc) => {
    expectTypeOf(doc.state.global.count).toBeNumber();
    return true;
  },
  async onChange() {
    return null;
  },
});

// Array of document types accepted.
createDocumentChangeTrigger<TestRegistry, "test/doc" | "test/other">({
  id: "t-multi",
  documentType: ["test/doc", "test/other"],
  async onChange(docs) {
    expectTypeOf(docs).toBeArray();
    return null;
  },
});

// ── Binding form (createTypes) ───────────────────────────────────

const configSchema = z.object({
  projectDocumentId: z.string().optional(),
});
declare const registry: TestRegistry;

const { createDocumentChangeTrigger: boundCreate } = createTypes({
  configSchema,
  registry,
});

// Only `T` (documentType) needs to be declared; TConfig + R come from the
// binding. ctx.context.config is narrowed to the config shape.
boundCreate<"test/doc">({
  id: "t5",
  documentType: "test/doc",
  documentId: async (ctx) => {
    expectTypeOf(ctx.context.config).toEqualTypeOf<{
      projectDocumentId?: string;
    }>();
    return ctx.context.config.projectDocumentId;
  },
  async onChange(docs, ctx) {
    const [doc] = docs;
    expectTypeOf(doc.state.global.name).toBeString();
    expectTypeOf(ctx.context.config.projectDocumentId).toEqualTypeOf<
      string | undefined
    >();
    return null;
  },
});

// Binding form still catches unknown documentType keys.
boundCreate<// @ts-expect-error — 'test/unknown' is not a key of TestRegistry
"test/unknown">({
  id: "t6",
  documentType: "test/unknown" as never,
  async onChange() {
    return null;
  },
});

// ── isDocType ────────────────────────────────────────────────────

// isDocType narrows a union-typed doc to a specific registry entry.
declare const unionDoc:
  | TestRegistry["test/doc"]["document"]
  | TestRegistry["test/other"]["document"];
if (isDocType<TestRegistry, "test/doc">(unionDoc, "test/doc")) {
  expectTypeOf(unionDoc.state.global).toHaveProperty("name");
}
