import { describe, expect, it, vi } from "vitest";
import type {
  GetDocumentOperationsQuery,
  GetDocumentQuery,
} from "../../src/graphql/gen/schema.js";
import type {
  ReactorGraphQLClient,
  RunDocumentOptions,
} from "../../src/graphql/types.js";
import { GraphQLReactorClient } from "../../src/graphql-client/graphql-reactor-client.js";
import type {
  MutateDocumentWithOperationsResult,
  MutateDocumentWithOperationsVariables,
} from "../../src/graphql-client/operations.js";

type Item = GetDocumentOperationsQuery["documentOperations"]["items"][number];

const document: NonNullable<GetDocumentQuery["document"]>["document"] = {
  id: "doc-1",
  slug: "doc-1",
  name: "Doc",
  documentType: "powerhouse/test",
  state: { global: {}, local: {} },
  createdAtUtcIso: "2026-01-01T00:00:00.000Z",
  lastModifiedAtUtcIso: "2026-01-01T00:00:00.000Z",
  revisionsList: [
    { scope: "global", revision: 2 },
    { scope: "document", revision: 2 },
  ],
};

function row(
  index: number,
  type: string,
  input: object,
  scope = "global",
  error: string | null = null,
): Item {
  return {
    index,
    timestampUtcMs: `${1700000000000 + index}`,
    hash: "",
    skip: 0,
    error,
    id: `op-${scope}-${index}`,
    action: {
      id: `${scope}-${index}`,
      type,
      timestampUtcMs: `${1700000000000 + index}`,
      input,
      scope,
      context: null,
    },
  };
}

function page(items: Item[]) {
  return {
    documentOperations: {
      items,
      hasNextPage: false,
      hasPreviousPage: false,
      cursor: null,
    },
  };
}

function clientWith(version: number, global: Item[]) {
  const create = row(
    0,
    "CREATE_DOCUMENT",
    { protocolVersions: { "base-reducer": version } },
    "document",
  );
  const mutated: MutateDocumentWithOperationsResult = {
    mutateDocument: { ...document, operations: { items: [] } },
  };
  const sdk = {
    GetDocument: vi.fn().mockResolvedValue({ document: { document } }),
    GetDocumentOperations: vi.fn(
      (variables: { filter: { scopes?: string[] } }) =>
        Promise.resolve(
          page(variables.filter.scopes?.[0] === "document" ? [create] : global),
        ),
    ),
    RunDocument: vi.fn().mockResolvedValue(mutated),
  };
  const client = new GraphQLReactorClient({
    url: "http://localhost:4001/graphql",
    graphqlClient: sdk as unknown as ReactorGraphQLClient,
    realtime: false,
  });
  return { client, sdk };
}

describe("GraphQLReactorClient undo and redo", () => {
  it("submits UNDO and REDO for the Switchboard to resolve", async () => {
    const { client, sdk } = clientWith(3, []);

    await client.undo("doc-1", "local", "draft");
    await client.redo("doc-1");

    const sent = sdk.RunDocument.mock.calls.map(
      ([options]) =>
        (options as RunDocumentOptions)
          .variables as MutateDocumentWithOperationsVariables,
    );
    expect(sent.map((variables) => variables.branch)).toEqual([
      "draft",
      "main",
    ]);
    expect(
      sent.map((variables) => {
        const [action] = variables.actions;
        return [action.type, action.scope];
      }),
    ).toEqual([
      ["UNDO", "local"],
      ["REDO", "global"],
    ]);
  });

  it("reads base-reducer 3 availability from the stream", async () => {
    const a = row(0, "ADD", {});
    const retracted = row(1, "RETRACT", { target: "global-0" });

    expect(
      await clientWith(3, [a]).client.undoRedoAvailability("doc-1"),
    ).toEqual({ canUndo: true, canRedo: false });
    expect(
      await clientWith(3, [a, retracted]).client.undoRedoAvailability("doc-1"),
    ).toEqual({ canUndo: false, canRedo: true });
  });

  it("treats a row stored with an error as one that threw", async () => {
    const threw = row(0, "ADD", {}, "global", "already exists");

    expect(
      await clientWith(3, [threw]).client.undoRedoAvailability("doc-1"),
    ).toEqual({ canUndo: false, canRedo: false });
  });

  it("reads base-reducer 2 availability from the revision", async () => {
    expect(
      await clientWith(2, []).client.undoRedoAvailability("doc-1"),
    ).toEqual({ canUndo: true, canRedo: false });
  });
});
