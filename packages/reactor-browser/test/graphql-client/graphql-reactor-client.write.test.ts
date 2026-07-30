import type { PropagationMode } from "@powerhousedao/reactor";
import type {
  Action,
  ISigner,
  Signature,
} from "@powerhousedao/shared/document-model";
import { hashDocumentStateForScope } from "@powerhousedao/shared/document-model";
import type { IRenown } from "@renown/sdk";
import { logger } from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GetDocumentQuery } from "../../src/graphql/gen/schema.js";
import type {
  ReactorGraphQLClient,
  RunDocumentOptions,
} from "../../src/graphql/types.js";
import { GraphQLReactorClient } from "../../src/graphql-client/graphql-reactor-client.js";
import type {
  MutateDocumentWithOperationsResult,
  MutateDocumentWithOperationsVariables,
} from "../../src/graphql-client/operations.js";

type MockSdk = {
  GetDocument: ReturnType<typeof vi.fn>;
  RunDocument: ReturnType<typeof vi.fn>;
  CreateDocument: ReturnType<typeof vi.fn>;
  DeleteDocument: ReturnType<typeof vi.fn>;
};

const state = { global: { name: "hello" }, local: {} };

const documentPayload: GetDocumentQuery = {
  document: {
    childIds: [],
    document: {
      id: "doc-1",
      slug: "my-doc",
      name: "My Doc",
      documentType: "powerhouse/test",
      state,
      createdAtUtcIso: "2026-01-01T00:00:00.000Z",
      lastModifiedAtUtcIso: "2026-01-02T00:00:00.000Z",
      revisionsList: [
        { scope: "global", revision: 7 },
        { scope: "document", revision: 1 },
      ],
    },
  },
};

const mutationPayload: MutateDocumentWithOperationsResult = {
  mutateDocument: {
    id: "doc-1",
    slug: "my-doc",
    name: "My Doc",
    documentType: "powerhouse/test",
    state: { global: { name: "world" }, local: {} },
    createdAtUtcIso: "2026-01-01T00:00:00.000Z",
    lastModifiedAtUtcIso: "2026-01-03T00:00:00.000Z",
    revisionsList: [
      { scope: "global", revision: 8 },
      { scope: "document", revision: 1 },
    ],
    operations: {
      items: [
        {
          index: 7,
          timestampUtcMs: "1700000007000",
          hash: "hash-7",
          skip: 0,
          error: "reducer rejected the action",
          id: "op-7",
          action: {
            id: "action-1",
            type: "SET_NAME",
            timestampUtcMs: "1700000007000",
            input: { name: "world" },
            scope: "global",
            context: null,
          },
        },
      ],
    },
  },
};

const action: Action = {
  id: "action-1",
  type: "SET_NAME",
  timestampUtcMs: "1700000007000",
  input: { name: "world" },
  scope: "global",
};

const secondAction: Action = { ...action, id: "action-2" };

function createMockSdk(overrides: Partial<MockSdk> = {}): MockSdk {
  return {
    GetDocument: vi.fn().mockResolvedValue(documentPayload),
    RunDocument: vi.fn().mockResolvedValue(mutationPayload),
    CreateDocument: vi.fn().mockResolvedValue({
      createDocument: documentPayload.document!.document,
    }),
    DeleteDocument: vi.fn().mockResolvedValue({ deleteDocument: true }),
    ...overrides,
  };
}

function createClientWith(sdk: MockSdk): GraphQLReactorClient {
  return new GraphQLReactorClient({
    url: "http://localhost:4001/graphql",
    graphqlClient: sdk as unknown as ReactorGraphQLClient,
  });
}

function runDocumentVariables(
  sdk: MockSdk,
): MutateDocumentWithOperationsVariables {
  const options = sdk.RunDocument.mock.calls[0][0] as RunDocumentOptions;
  return options.variables as MutateDocumentWithOperationsVariables;
}

const signature: Signature = [
  "1700000007",
  "did:key:test",
  "action-hash",
  "prev-hash",
  "0xdeadbeef",
];

function installSigner(): {
  signer: ISigner;
  signAction: ReturnType<typeof vi.fn>;
} {
  const signAction = vi.fn().mockResolvedValue(signature);
  const signer = {
    user: { address: "0x1", networkId: "eip155", chainId: 1 },
    app: { name: "test-app", key: "app-key" },
    signAction,
  } as unknown as ISigner;

  window.ph = {
    renown: {
      user: signer.user,
      signer,
    } as unknown as IRenown,
  };

  return { signer, signAction };
}

beforeEach(() => {
  window.ph = {};
});

afterEach(() => {
  window.ph = {};
  vi.restoreAllMocks();
});

describe("GraphQLReactorClient.execute", () => {
  it("fetches the document before pushing and narrows the returned operations", async () => {
    const sdk = createMockSdk();
    await createClientWith(sdk).execute("doc-1", "main", [action]);

    expect(sdk.GetDocument).toHaveBeenCalledWith(
      { identifier: "doc-1", view: { branch: "main", scopes: undefined } },
      undefined,
      undefined,
    );
    expect(runDocumentVariables(sdk)).toEqual({
      documentIdentifier: "doc-1",
      actions: [action],
      view: { branch: "main" },
      sinceRevision: 7,
      scopes: ["global"],
      branch: "main",
    });
  });

  it("limits the returned operations to the scopes the actions target", async () => {
    const sdk = createMockSdk();
    await createClientWith(sdk).execute("doc-1", "main", [
      action,
      { ...secondAction, scope: "document" },
      { ...secondAction, id: "action-3", scope: "global" },
    ]);

    // Without this the server walks every scope of the document from the
    // lowest head revision, dragging the whole global history back on a
    // document-scope write.
    expect(runDocumentVariables(sdk).scopes).toEqual(["global", "document"]);
  });

  it("reads the operations from the branch it writes to", async () => {
    const sdk = createMockSdk();
    const result = await createClientWith(sdk).execute("doc-1", "feature-x", [
      action,
    ]);

    // An unbranched operations filter is answered from main, so per-action
    // reducer errors on any other branch would be invisible.
    expect(runDocumentVariables(sdk).branch).toBe("feature-x");
    expect(runDocumentVariables(sdk).view).toEqual({ branch: "feature-x" });
    expect(result.header.branch).toBe("feature-x");
  });

  it("pushes the raw action when there is no signer", async () => {
    const sdk = createMockSdk();
    await createClientWith(sdk).execute("doc-1", "main", [action]);

    expect(runDocumentVariables(sdk).actions).toEqual([action]);
  });

  it("returns the mutated document with its new operations per scope", async () => {
    const sdk = createMockSdk();
    const result = await createClientWith(sdk).execute("doc-1", "main", [
      action,
    ]);

    expect(result.header.id).toBe("doc-1");
    expect(result.header.revision).toEqual({ global: 8, document: 1 });
    expect(result.state).toEqual({ global: { name: "world" }, local: {} });
    expect(result.operations.document).toEqual([]);
    expect(result.operations.global).toHaveLength(1);
    expect(result.operations.global[0]).toMatchObject({
      id: "op-7",
      index: 7,
      hash: "hash-7",
      error: "reducer rejected the action",
    });
  });

  it("carries per-action errors where dispatchActions looks for them", async () => {
    const sdk = createMockSdk();
    const result = await createClientWith(sdk).execute("doc-1", "main", [
      action,
    ]);

    // Mirrors getActionErrors in src/actions/dispatch.ts.
    const scopeOperations = result.operations[action.scope];
    const operation = scopeOperations.findLast(
      (op) => op.action.id === action.id,
    );

    expect(operation?.action.id).toBe("action-1");
    expect(operation?.error).toBe("reducer rejected the action");
  });

  it("forwards the abort signal to both round trips", async () => {
    const sdk = createMockSdk();
    const controller = new AbortController();
    await createClientWith(sdk).execute(
      "doc-1",
      "main",
      [action],
      controller.signal,
    );

    expect(sdk.GetDocument.mock.calls[0][2]).toBe(controller.signal);
    const options = sdk.RunDocument.mock.calls[0][0] as RunDocumentOptions;
    expect(options.signal).toBe(controller.signal);
    expect(options.operationName).toBe("MutateDocumentWithOperations");
    expect(options.operationType).toBe("mutation");
  });

  it("stamps and signs a single action when a signer is available", async () => {
    const { signAction } = installSigner();
    const sdk = createMockSdk();
    await createClientWith(sdk).execute("doc-1", "main", [action]);

    const pushed = runDocumentVariables(sdk).actions[0] as Action;
    expect(pushed.context?.prevOpHash).toBe(
      hashDocumentStateForScope({ state }, "global"),
    );
    expect(pushed.context?.prevOpIndex).toBe(6);
    expect(pushed.context?.signer?.signatures).toEqual([signature]);
    expect(signAction).toHaveBeenCalledTimes(1);

    // The signer reads prevOpHash off the action, so stamping must come first.
    const signedArgument = signAction.mock.calls[0][0] as Action;
    expect(signedArgument.context?.prevOpHash).toBe(
      hashDocumentStateForScope({ state }, "global"),
    );
  });

  it("pushes multi-action batches unsigned and warns", async () => {
    const { signAction } = installSigner();
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    const sdk = createMockSdk();

    await createClientWith(sdk).execute("doc-1", "main", [
      action,
      secondAction,
    ]);

    expect(signAction).not.toHaveBeenCalled();
    expect(runDocumentVariables(sdk).actions).toEqual([action, secondAction]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("unsigned");
  });

  it("does not sign when renown has no logged-in user", async () => {
    const { signAction, signer } = installSigner();
    window.ph = { renown: { signer } as unknown as IRenown };
    const sdk = createMockSdk();

    await createClientWith(sdk).execute("doc-1", "main", [action]);

    expect(signAction).not.toHaveBeenCalled();
    expect(runDocumentVariables(sdk).actions).toEqual([action]);
  });

  it("takes the lowest head revision across the targeted scopes", async () => {
    const sdk = createMockSdk();
    await createClientWith(sdk).execute("doc-1", "main", [
      action,
      { ...secondAction, scope: "document" },
    ]);

    expect(runDocumentVariables(sdk).sinceRevision).toBe(1);
  });

  it("rejects when the mutation fails", async () => {
    const sdk = createMockSdk({
      RunDocument: vi
        .fn()
        .mockRejectedValue(new Error("Action validation failed")),
    });

    await expect(
      createClientWith(sdk).execute("doc-1", "main", [action]),
    ).rejects.toThrow("Action validation failed");
  });

  it("rejects when the document cannot be fetched", async () => {
    const sdk = createMockSdk({
      GetDocument: vi.fn().mockResolvedValue({ document: null }),
    });

    await expect(
      createClientWith(sdk).execute("missing", "main", [action]),
    ).rejects.toThrow("Document not found: missing");
    expect(sdk.RunDocument).not.toHaveBeenCalled();
  });
});

describe("GraphQLReactorClient.create", () => {
  it("sends the document and the optional parent", async () => {
    const sdk = createMockSdk();
    const document = await createClientWith(sdk).create(
      { header: { id: "doc-1" } } as never,
      "parent-1",
    );

    expect(sdk.CreateDocument).toHaveBeenCalledWith(
      { document: { header: { id: "doc-1" } }, parentIdentifier: "parent-1" },
      undefined,
      undefined,
    );
    expect(document.header.id).toBe("doc-1");
    expect(document.header.revision).toEqual({ global: 7, document: 1 });
  });

  it("omits the parent when none is given", async () => {
    const sdk = createMockSdk();
    await createClientWith(sdk).create({ header: { id: "doc-1" } } as never);

    expect(sdk.CreateDocument).toHaveBeenCalledWith(
      { document: { header: { id: "doc-1" } }, parentIdentifier: undefined },
      undefined,
      undefined,
    );
  });

  it("propagates GraphQL errors", async () => {
    const sdk = createMockSdk({
      CreateDocument: vi.fn().mockRejectedValue(new Error("boom")),
    });

    await expect(
      createClientWith(sdk).create({ header: { id: "doc-1" } } as never),
    ).rejects.toThrow("boom");
  });
});

describe("GraphQLReactorClient.deleteDocument", () => {
  it("sends the identifier without a propagation mode by default", async () => {
    const sdk = createMockSdk();
    await createClientWith(sdk).deleteDocument("doc-1");

    expect(sdk.DeleteDocument).toHaveBeenCalledWith(
      { identifier: "doc-1", propagate: undefined },
      undefined,
      undefined,
    );
  });

  it("maps the reactor propagation modes onto the schema enum", async () => {
    const sdk = createMockSdk();
    const client = createClientWith(sdk);

    await client.deleteDocument("doc-1", "cascade" as PropagationMode);
    await client.deleteDocument("doc-2", "none" as PropagationMode);

    expect(sdk.DeleteDocument.mock.calls[0][0]).toEqual({
      identifier: "doc-1",
      propagate: "CASCADE",
    });
    expect(sdk.DeleteDocument.mock.calls[1][0]).toEqual({
      identifier: "doc-2",
      propagate: "ORPHAN",
    });
  });

  it("propagates GraphQL errors", async () => {
    const sdk = createMockSdk({
      DeleteDocument: vi.fn().mockRejectedValue(new Error("forbidden")),
    });

    await expect(createClientWith(sdk).deleteDocument("doc-1")).rejects.toThrow(
      "forbidden",
    );
  });
});
