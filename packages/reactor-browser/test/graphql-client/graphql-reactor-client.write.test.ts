import type { PropagationMode } from "@powerhousedao/reactor";
import type {
  Action,
  ISigner,
  Signature,
} from "@powerhousedao/shared/document-model";
import type { PHBaseState } from "@powerhousedao/shared/document-model";
import {
  createReducer,
  hashDocumentStateForScope,
  serializeSignature,
} from "@powerhousedao/shared/document-model";
import type { IRenown } from "@renown/sdk";
import type { DocumentModelModule, PHDocument } from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GetDocumentQuery } from "../../src/graphql/gen/schema.js";
import type {
  ReactorGraphQLClient,
  RunDocumentOptions,
} from "../../src/graphql/types.js";
import {
  GraphQLReactorClient,
  type GraphQLReactorClientOptions,
} from "../../src/graphql-client/graphql-reactor-client.js";
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

function createClientWith(
  sdk: MockSdk,
  options: Partial<GraphQLReactorClientOptions> = {},
): GraphQLReactorClient {
  return new GraphQLReactorClient({
    url: "http://localhost:4001/graphql",
    graphqlClient: sdk as unknown as ReactorGraphQLClient,
    ...options,
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

/** The shape the test module's reducer writes to, i.e. `documentPayload.state`. */
type TestState = PHBaseState & { global: { name: string } };

// A real base reducer over a trivial state reducer: batch signing is only
// meaningful against a reducer that actually appends operations and moves the
// state the next signature hashes.
function createTestModule(
  version: number | undefined,
  transform: (name: string) => string = (name) => name,
): DocumentModelModule<any> {
  return {
    version,
    reducer: createReducer<TestState>((draft, reduced) => {
      if (reduced.type === "SET_TEST_NAME") {
        draft.global.name = transform((reduced.input as { name: string }).name);
      }
    }),
    actions: {},
    utils: {},
    documentModel: { global: { id: "powerhouse/test" }, local: {} },
  } as unknown as DocumentModelModule<any>;
}

function batchAction(id: string, name: string): Action {
  return {
    id,
    type: "SET_TEST_NAME",
    timestampUtcMs: "1700000007000",
    input: { name },
    scope: "global",
  };
}

const batch: Action[] = [
  batchAction("action-1", "first"),
  batchAction("action-2", "second"),
  batchAction("action-3", "third"),
];

/** The snapshot the client builds out of `documentPayload`, for hand-folding. */
function snapshotForFold(): PHDocument {
  return {
    header: {
      id: "doc-1",
      revision: { global: 7, document: 1 },
    },
    state,
    initialState: state,
    operations: { global: [], document: [] },
    clipboard: [],
  } as unknown as PHDocument;
}

function foldScopeHashes(
  module: DocumentModelModule<any>,
  actions: readonly Action[],
): string[] {
  let document = snapshotForFold();
  const hashes: string[] = [];
  for (const folded of actions) {
    hashes.push(hashDocumentStateForScope(document, "global"));
    document = module.reducer(document as never, folded, undefined, {
      protocolVersion: 2,
    }) as unknown as PHDocument;
  }
  return hashes;
}

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
    // Joined for transport: GraphQL declares signatures as a list of strings,
    // not of lists, and the server splits them again on arrival.
    expect(pushed.context?.signer?.signatures).toEqual([
      serializeSignature(signature),
    ]);
    expect(signAction).toHaveBeenCalledTimes(1);

    // The signer reads prevOpHash off the action, so stamping must come first.
    const signedArgument = signAction.mock.calls[0][0] as Action;
    expect(signedArgument.context?.prevOpHash).toBe(
      hashDocumentStateForScope({ state }, "global"),
    );
  });

  it("pushes a multi-action batch unsigned when there is no signer", async () => {
    const sdk = createMockSdk();

    // No signer, no signatures to protect - and therefore no models needed.
    await createClientWith(sdk).execute("doc-1", "main", [
      action,
      secondAction,
    ]);

    expect(runDocumentVariables(sdk).actions).toEqual([action, secondAction]);
  });

  it("signs every action of a batch in one mutation", async () => {
    const { signAction } = installSigner();
    const sdk = createMockSdk();
    const module = createTestModule(1);

    await createClientWith(sdk, { documentModels: [module] }).execute(
      "doc-1",
      "main",
      batch,
    );

    expect(sdk.RunDocument).toHaveBeenCalledTimes(1);
    expect(signAction).toHaveBeenCalledTimes(3);
    const pushed = runDocumentVariables(sdk).actions as Action[];
    expect(pushed.map((a) => a.id)).toEqual([
      "action-1",
      "action-2",
      "action-3",
    ]);
    for (const pushedAction of pushed) {
      expect(pushedAction.context?.signer?.signatures).toEqual([
        serializeSignature(signature),
      ]);
    }
  });

  it("chains the batch onto the document's own head", async () => {
    installSigner();
    const sdk = createMockSdk();
    const module = createTestModule(1);

    await createClientWith(sdk, { documentModels: [module] }).execute(
      "doc-1",
      "main",
      batch,
    );

    const pushed = runDocumentVariables(sdk).actions as Action[];
    // The document is at global revision 7, so the batch continues from index 6.
    expect(pushed.map((a) => a.context?.prevOpIndex)).toEqual([6, 7, 8]);
    expect(pushed.map((a) => a.context?.prevOpHash)).toEqual(
      foldScopeHashes(module, batch),
    );
  });

  it("signs a batch with the module matching the document's exact version", async () => {
    installSigner();
    const sdk = createMockSdk({
      GetDocument: vi.fn().mockResolvedValue({
        document: {
          ...documentPayload.document!,
          document: {
            ...documentPayload.document!.document,
            state: { ...state, document: { version: 2 } },
          },
        },
      }),
    });
    // v1 and v2 write different state, so the hash chain says which one ran.
    const v1 = createTestModule(1);
    const v2 = createTestModule(2, (name) => name.toUpperCase());

    await createClientWith(sdk, { documentModels: [v1, v2] }).execute(
      "doc-1",
      "main",
      batch,
    );

    const pushed = runDocumentVariables(sdk).actions as Action[];
    expect(pushed.map((a) => a.context?.prevOpHash)).toEqual(
      foldScopeHashes(v2, batch),
    );
    expect(pushed.map((a) => a.context?.prevOpHash)).not.toEqual(
      foldScopeHashes(v1, batch),
    );
  });

  it("treats an unversioned document as version 1", async () => {
    installSigner();
    const sdk = createMockSdk();
    // `documentPayload` carries no `state.document`, which is what a document
    // written before versioning looks like.
    const v1 = createTestModule(1);
    const v2 = createTestModule(2, (name) => name.toUpperCase());

    await createClientWith(sdk, { documentModels: [v2, v1] }).execute(
      "doc-1",
      "main",
      batch,
    );

    const pushed = runDocumentVariables(sdk).actions as Action[];
    expect(pushed.map((a) => a.context?.prevOpHash)).toEqual(
      foldScopeHashes(v1, batch),
    );
  });

  it("forwards the abort signal to the signer", async () => {
    const { signAction } = installSigner();
    const sdk = createMockSdk();
    const controller = new AbortController();

    await createClientWith(sdk, {
      documentModels: [createTestModule(1)],
    }).execute("doc-1", "main", batch, controller.signal);

    for (const call of signAction.mock.calls) {
      expect(call[1]).toBe(controller.signal);
    }
  });

  it("does not mutate the actions it was given", async () => {
    installSigner();
    const sdk = createMockSdk();
    const before = JSON.stringify(batch);

    await createClientWith(sdk, {
      documentModels: [createTestModule(1)],
    }).execute("doc-1", "main", batch);

    expect(JSON.stringify(batch)).toBe(before);
  });

  it("refuses a batch when no models were given, instead of sending it unsigned", async () => {
    installSigner();
    const sdk = createMockSdk();

    await expect(
      createClientWith(sdk).execute("doc-1", "main", batch),
    ).rejects.toThrow("Unknown document model version: powerhouse/test v1");
    expect(sdk.RunDocument).not.toHaveBeenCalled();
  });

  it("refuses a batch when the document's exact version is missing", async () => {
    installSigner();
    const sdk = createMockSdk({
      GetDocument: vi.fn().mockResolvedValue({
        document: {
          ...documentPayload.document!,
          document: {
            ...documentPayload.document!.document,
            state: { ...state, document: { version: 3 } },
          },
        },
      }),
    });

    await expect(
      createClientWith(sdk, {
        documentModels: [createTestModule(1), createTestModule(2)],
      }).execute("doc-1", "main", batch),
    ).rejects.toThrow("Unknown document model version: powerhouse/test v3");
    expect(sdk.RunDocument).not.toHaveBeenCalled();
  });

  it("refuses a batch of actions in different scopes", async () => {
    installSigner();
    const sdk = createMockSdk();

    await expect(
      createClientWith(sdk, {
        documentModels: [createTestModule(1)],
      }).execute("doc-1", "main", [
        batch[0],
        { ...batch[1], scope: "document" },
      ]),
    ).rejects.toThrow('spanning scopes "global" and "document"');
    expect(sdk.RunDocument).not.toHaveBeenCalled();
  });

  it("signs a single action without any document models", async () => {
    const { signAction } = installSigner();
    const sdk = createMockSdk();

    await createClientWith(sdk).execute("doc-1", "main", [action]);

    expect(signAction).toHaveBeenCalledTimes(1);
    const pushed = runDocumentVariables(sdk).actions[0] as Action;
    expect(pushed.context?.signer?.signatures).toEqual([
      serializeSignature(signature),
    ]);
  });

  it("signs with an explicitly supplied signer instead of renown", async () => {
    const explicitSign = vi.fn().mockResolvedValue(signature);
    const explicitSigner = {
      user: { address: "0x9", networkId: "eip155", chainId: 1 },
      app: { name: "explicit-app", key: "explicit-key" },
      signAction: explicitSign,
    } as unknown as ISigner;
    const { signAction: ambientSign } = installSigner();
    const sdk = createMockSdk();

    await createClientWith(sdk, {
      signer: explicitSigner,
      documentModels: [createTestModule(1)],
    }).execute("doc-1", "main", batch);

    expect(explicitSign).toHaveBeenCalledTimes(3);
    expect(ambientSign).not.toHaveBeenCalled();
    const pushed = runDocumentVariables(sdk).actions as Action[];
    expect(pushed[0].context?.signer?.app).toEqual(explicitSigner.app);
  });

  it("signs with an explicit signer when nobody is logged in", async () => {
    const explicitSign = vi.fn().mockResolvedValue(signature);
    const explicitSigner = {
      user: { address: "0x9", networkId: "eip155", chainId: 1 },
      app: { name: "explicit-app", key: "explicit-key" },
      signAction: explicitSign,
    } as unknown as ISigner;
    const sdk = createMockSdk();

    await createClientWith(sdk, { signer: explicitSigner }).execute(
      "doc-1",
      "main",
      [action],
    );

    expect(explicitSign).toHaveBeenCalledTimes(1);
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
