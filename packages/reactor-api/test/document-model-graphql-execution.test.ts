import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import {
  defineDocumentModel,
  defineDocumentModelFamily,
  ph,
} from "document-model";
import type { ExecutionResult } from "graphql";
import { describe, expect, it } from "vitest";
import { DocumentModelSubgraph } from "../src/graphql/document-model-subgraph.js";
import {
  asSchemaFirst,
  hostFor,
  messages,
  printSchema,
  reactorClientFor,
  subgraphArgs,
} from "./utils/graphql-host.js";

/**
 * Executes real GraphQL requests against a code-first model and compares each
 * outcome with the same model projected from stored SDL. The cases are a
 * successful mutation, an input GraphQL rejects, an operation with no fields,
 * both kinds of domain error, and a union the resolver must discriminate.
 */

/** A model with a union, an errorless operation, and both error shapes. */
function buildTracker(): DocumentModelModule {
  const Note = ph.object("Note", {
    fields: { body: ph.String({ required: true }) },
  });
  const Link = ph.object("Link", {
    fields: { href: ph.String({ required: true }) },
  });
  const Annotation = ph.union("Annotation", { members: [Note, Link] });

  const context = defineDocumentModel({
    id: "test/tracker",
    name: "Tracker",
    description: "A tracker.",
    extension: "tracker",
    version: 1,
    author: { name: "Powerhouse", website: null },
    specifications: {
      global: {
        schema: ph.object("TrackerState", {
          fields: {
            title: ph.String({ required: true }),
            count: ph.Int({ required: true }),
            annotations: ph.list(ph.ref(Annotation, { required: true })),
          },
        }),
        initialValue: { title: "", count: 0, annotations: null },
      },
      local: { schema: null, initialValue: {} },
    },
  });

  const entries = context.module("entries", {
    operations: ({ global }) => ({
      setTitle: global({
        input: ph.input({ fields: { title: ph.String({ required: true }) } }),
        reduce(state, input) {
          state.title = input.title;
        },
      }),
      reset: global({
        input: ph.input({ fields: {} }),
        reduce(state) {
          state.count = 0;
        },
      }),
      addCount: global({
        input: ph.input({ fields: { by: ph.Int({ required: true }) } }),
        errors: { NotPositive: {}, TooLarge: {} },
        reduce(state, input, ctx) {
          // No authored message, so the compiled class uses its key.
          if (input.by <= 0) throw new ctx.errors.NotPositive();
          if (input.by > 100) {
            throw new ctx.errors.TooLarge(
              "that is more than the tracker can hold",
            );
          }
          state.count += input.by;
        },
      }),
    }),
  });

  return defineDocumentModelFamily({
    versions: [context.version({ modules: [entries] })],
    upgradeManifest: {
      documentType: "test/tracker",
      latestVersion: 1,
      supportedVersions: [1],
      upgrades: {},
    },
  }).at(1) as unknown as DocumentModelModule;
}

const TRACKER = buildTracker();
const TRACKER_AS_STORED = asSchemaFirst(TRACKER);

/** Runs one request against both projections and returns the two outcomes. */
async function bothPaths(
  source: string,
  variableValues?: Record<string, unknown>,
): Promise<{
  readonly structured: ExecutionResult;
  readonly stored: ExecutionResult;
  readonly structuredState: Record<string, unknown>;
  readonly storedState: Record<string, unknown>;
}> {
  const structuredHost = hostFor(buildTracker());
  const storedHost = hostFor(asSchemaFirst(buildTracker()));
  const structured = await structuredHost.run(source, variableValues);
  const stored = await storedHost.run(source, variableValues);
  return {
    structured,
    stored,
    structuredState: structuredHost.state(),
    storedState: storedHost.state(),
  };
}

describe("a code-first model serves real requests", () => {
  it("applies a mutation and the reducer's effect is visible", async () => {
    const outcome = await bothPaths(
      `mutation ($input: Tracker_SetTitleInput!) {
         Tracker { setTitle(docId: "doc-1", input: $input) { id name } }
       }`,
      { input: { title: "Q3" } },
    );
    expect(messages(outcome.structured)).toEqual([]);
    expect(outcome.structuredState.title).toBe("Q3");
    expect(outcome.structuredState).toEqual(outcome.storedState);
    expect(messages(outcome.structured)).toEqual(messages(outcome.stored));
  });

  it("rejects an input GraphQL cannot coerce, before any reducer runs", async () => {
    const outcome = await bothPaths(
      `mutation ($input: Tracker_AddCountInput!) {
         Tracker { addCount(docId: "doc-1", input: $input) { id } }
       }`,
      { input: { by: "not a number" } },
    );
    expect(messages(outcome.structured)[0]).toMatch(/Int/);
    expect(messages(outcome.structured)).toEqual(messages(outcome.stored));
    // Variable coercion fails before execution, so the document is unchanged.
    expect(outcome.structuredState.count).toBe(0);
    expect(outcome.structuredState).toEqual(outcome.storedState);
  });

  it("accepts an operation that takes no fields", async () => {
    const outcome = await bothPaths(
      `mutation {
         Tracker { reset(docId: "doc-1", input: {}) { revisionsList { scope revision } } }
       }`,
    );
    expect(outcome.structured.data).toEqual({
      Tracker: {
        reset: {
          revisionsList: [
            { scope: "document", revision: 0 },
            { scope: "global", revision: 1 },
          ],
        },
      },
    });
    expect(outcome.structured).toEqual(outcome.stored);
  });

  it("reports a domain error with its default message", async () => {
    const outcome = await bothPaths(
      `mutation ($input: Tracker_AddCountInput!) {
         Tracker { addCount(docId: "doc-1", input: $input) { id } }
       }`,
      { input: { by: 0 } },
    );
    expect(messages(outcome.structured)).toEqual(["NotPositive"]);
    expect(messages(outcome.structured)).toEqual(messages(outcome.stored));
  });

  it("reports a domain error with its authored message", async () => {
    const outcome = await bothPaths(
      `mutation ($input: Tracker_AddCountInput!) {
         Tracker { addCount(docId: "doc-1", input: $input) { id } }
       }`,
      { input: { by: 1000 } },
    );
    expect(messages(outcome.structured)).toEqual([
      "that is more than the tracker can hold",
    ]);
    expect(messages(outcome.structured)).toEqual(messages(outcome.stored));
  });
});

describe("union resolution", () => {
  it("discriminates a union member by a field its siblings lack", () => {
    const structured = new DocumentModelSubgraph(
      TRACKER,
      subgraphArgs(reactorClientFor(TRACKER).client),
    );
    const stored = new DocumentModelSubgraph(
      TRACKER_AS_STORED,
      subgraphArgs(reactorClientFor(TRACKER_AS_STORED).client),
    );
    const resolveOn = (subgraph: DocumentModelSubgraph, value: unknown) =>
      (
        subgraph.resolvers as unknown as Record<
          string,
          { __resolveType: (value: unknown) => string }
        >
      ).Tracker_Annotation.__resolveType(value);

    expect(resolveOn(structured, { body: "hello" })).toBe("Tracker_Note");
    expect(resolveOn(structured, { href: "https://x" })).toBe("Tracker_Link");
    // An ambiguous value resolves to the first member, matching the stored-SDL
    // path.
    expect(resolveOn(structured, { other: 1 })).toBe("Tracker_Note");

    for (const value of [{ body: "hello" }, { href: "https://x" }, { z: 1 }]) {
      expect(resolveOn(structured, value)).toBe(resolveOn(stored, value));
    }
  });
});

describe("the served schema", () => {
  it("is the same schema either projection produced", () => {
    const structured = printSchema(hostFor(TRACKER).schema);
    expect(structured).toBe(printSchema(hostFor(TRACKER_AS_STORED).schema));
    expect(structured).toContain(
      "union Tracker_Annotation = Tracker_Link | Tracker_Note",
    );
  });
});
