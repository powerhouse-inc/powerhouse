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

/** A Switchboard serving a document created at `version` whose undo targets are `targets`. */
function clientWith(
  version: number | undefined,
  targets: { undoTarget?: string; redoTarget?: string } = {},
  options: { headerVersions?: boolean; withoutTargetsQuery?: boolean } = {},
) {
  const create = row(
    0,
    "CREATE_DOCUMENT",
    version === undefined
      ? {}
      : { protocolVersions: { "base-reducer": version } },
    "document",
  );
  const served = options.headerVersions
    ? { ...document, protocolVersions: { "base-reducer": version } }
    : document;
  const mutated: MutateDocumentWithOperationsResult = {
    mutateDocument: { ...served, operations: { items: [] } },
  };
  const sdk = {
    GetDocument: vi.fn().mockResolvedValue({ document: { document: served } }),
    GetDocumentOperations: vi.fn(
      (variables: { filter: { scopes?: string[] } }) =>
        Promise.resolve(
          page(variables.filter.scopes?.[0] === "document" ? [create] : []),
        ),
    ),
    GetUndoRedoTargets: vi.fn((_variables: unknown) =>
      options.withoutTargetsQuery
        ? Promise.reject(
            Object.assign(new Error("validation"), {
              response: {
                errors: [
                  {
                    message:
                      'Cannot query field "undoRedoTargets" on type "Query".',
                  },
                ],
              },
            }),
          )
        : Promise.resolve({
            undoRedoTargets: {
              undoTarget: targets.undoTarget ?? null,
              redoTarget: targets.redoTarget ?? null,
            },
          }),
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

function sentActions(sdk: ReturnType<typeof clientWith>["sdk"]) {
  return sdk.RunDocument.mock.calls.map(([options]) => {
    const variables = (options as RunDocumentOptions)
      .variables as MutateDocumentWithOperationsVariables;
    const [action] = variables.actions;
    return {
      branch: variables.branch,
      type: action.type,
      scope: action.scope,
      input: action.input,
    };
  });
}

describe("GraphQLReactorClient undo and redo", () => {
  it("submits UNDO and REDO below base-reducer 3", async () => {
    const { client, sdk } = clientWith(2);

    await client.undo("doc-1", "local", "draft");
    await client.redo("doc-1");

    expect(sentActions(sdk)).toEqual([
      expect.objectContaining({
        branch: "draft",
        type: "UNDO",
        scope: "local",
      }),
      expect.objectContaining({
        branch: "main",
        type: "REDO",
        scope: "global",
      }),
    ]);
    expect(sdk.GetUndoRedoTargets).not.toHaveBeenCalled();
  });

  it("submits UNDO for a document that names no base-reducer version", async () => {
    const { client, sdk } = clientWith(undefined);

    await client.undo("doc-1");

    expect(sentActions(sdk)).toEqual([
      expect.objectContaining({ type: "UNDO", scope: "global" }),
    ]);
    expect(sdk.GetUndoRedoTargets).not.toHaveBeenCalled();
  });

  it("signs a RETRACT of the target the Switchboard resolves on base-reducer 3", async () => {
    const { client, sdk } = clientWith(3, {
      undoTarget: "global-1",
      redoTarget: "retract-2",
    });

    await client.undo("doc-1", "local", "draft");
    await client.redo("doc-1");

    expect(
      sdk.GetUndoRedoTargets.mock.calls.map(([variables]) => variables),
    ).toEqual([
      { documentIdOrSlug: "doc-1", scope: "local", branch: "draft" },
      { documentIdOrSlug: "doc-1", scope: "global", branch: "main" },
    ]);
    expect(sentActions(sdk)).toEqual([
      {
        branch: "draft",
        type: "RETRACT",
        scope: "local",
        input: { target: "global-1" },
      },
      {
        branch: "main",
        type: "RETRACT",
        scope: "global",
        input: { target: "retract-2" },
      },
    ]);
  });

  it("reads the version from the header when the Switchboard serves it", async () => {
    const { client, sdk } = clientWith(
      3,
      { undoTarget: "global-1" },
      { headerVersions: true },
    );

    await client.undo("doc-1");

    expect(sdk.GetDocumentOperations).not.toHaveBeenCalled();
    expect(sentActions(sdk)[0].type).toBe("RETRACT");
  });

  it.each([
    ["the header", { headerVersions: true }],
    ["CREATE_DOCUMENT", {}],
  ] as const)(
    "undoes a number %s names that this build does not know as base-reducer 3",
    async (_source, options) => {
      const { client, sdk } = clientWith(
        7,
        { undoTarget: "global-1" },
        options,
      );

      await client.undo("doc-1");

      expect(sdk.GetUndoRedoTargets).toHaveBeenCalled();
      expect(sentActions(sdk)).toEqual([
        {
          branch: "main",
          type: "RETRACT",
          scope: "global",
          input: { target: "global-1" },
        },
      ]);
    },
  );

  it("submits UNDO when the header names base-reducer 2", async () => {
    const { client, sdk } = clientWith(2, {}, { headerVersions: true });

    await client.undo("doc-1");

    expect(sdk.GetUndoRedoTargets).not.toHaveBeenCalled();
    expect(sentActions(sdk)[0].type).toBe("UNDO");
  });

  it("stops a queued undo whose signal aborts while an earlier one is pending", async () => {
    const { client, sdk } = clientWith(2);
    sdk.RunDocument.mockImplementationOnce(() => new Promise(() => undefined));
    void client.undo("doc-1");
    await vi.waitUntil(() => sdk.RunDocument.mock.calls.length === 1);
    const controller = new AbortController();

    const queued = client.undo("doc-1", "global", "main", controller.signal);
    controller.abort();

    await expect(queued).rejects.toMatchObject({ name: "AbortError" });
    expect(sdk.RunDocument).toHaveBeenCalledTimes(1);
  });

  it("refuses an undo with nothing to undo, submitting nothing", async () => {
    const { client, sdk } = clientWith(3);

    await expect(client.undo("doc-1")).rejects.toThrow(
      "Cannot undo: nothing to undo in scope history",
    );
    expect(sdk.RunDocument).not.toHaveBeenCalled();
  });

  it("refuses a base-reducer 3 undo on a Switchboard without undoRedoTargets", async () => {
    const { client } = clientWith(3, {}, { withoutTargetsQuery: true });

    await expect(client.undo("doc-1")).rejects.toMatchObject({
      name: "GraphQLOperationNotSupportedError",
    });
  });

  it("reads base-reducer 3 availability from the resolved targets", async () => {
    expect(
      await clientWith(3, {
        undoTarget: "global-0",
      }).client.undoRedoAvailability("doc-1"),
    ).toEqual({ canUndo: true, canRedo: false });
    expect(
      await clientWith(3, {
        redoTarget: "global-1",
      }).client.undoRedoAvailability("doc-1"),
    ).toEqual({ canUndo: false, canRedo: true });
  });

  it("reads base-reducer 2 availability as false on a scope the Switchboard withholds", async () => {
    const { client, sdk } = clientWith(2);
    sdk.GetDocument.mockResolvedValue({
      document: {
        document: {
          ...document,
          state: { local: {} },
          revisionsList: [
            ...document.revisionsList,
            { scope: "local", revision: 1 },
          ],
        },
      },
    });

    expect(await client.undoRedoAvailability("doc-1")).toEqual({
      canUndo: false,
      canRedo: false,
    });
    expect(await client.undoRedoAvailability("doc-1", "local")).toEqual({
      canUndo: true,
      canRedo: false,
    });
  });

  it("reads base-reducer 2 availability from the revision", async () => {
    expect(await clientWith(2).client.undoRedoAvailability("doc-1")).toEqual({
      canUndo: true,
      canRedo: false,
    });
  });
});
