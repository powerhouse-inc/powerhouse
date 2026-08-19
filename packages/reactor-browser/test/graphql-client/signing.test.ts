import type {
  Action,
  ISigner,
  PHDocument,
  Signature,
} from "@powerhousedao/shared/document-model";
import {
  addModule,
  hashDocumentStateForScope,
  setModelDescription,
  setModelName,
  setModuleName,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { describe, expect, it, vi } from "vitest";
import {
  prepareSignedActions,
  signStampedAction,
  stampAction,
} from "../../src/graphql-client/signing.js";

const state = { global: { name: "hello" }, local: {} };

function createDocument(revision: Record<string, number>): PHDocument {
  return {
    header: {
      id: "doc-1",
      sig: { publicKey: {}, nonce: "" },
      documentType: "powerhouse/test",
      createdAtUtcIso: "2026-01-01T00:00:00.000Z",
      slug: "my-doc",
      name: "My Doc",
      branch: "main",
      revision,
      lastModifiedAtUtcIso: "2026-01-02T00:00:00.000Z",
    },
    state,
    initialState: state,
    operations: {},
    clipboard: [],
  } as unknown as PHDocument;
}

const action: Action = {
  id: "action-1",
  type: "SET_NAME",
  timestampUtcMs: "1700000007000",
  input: { name: "world" },
  scope: "global",
};

const signature: Signature = ["ts", "did", "hash", "prev", "0xsig"];

function createSigner(): ISigner {
  return {
    user: { address: "0x1", networkId: "eip155", chainId: 1 },
    app: { name: "test-app", key: "app-key" },
    signAction: vi.fn().mockResolvedValue(signature),
  } as unknown as ISigner;
}

describe("stampAction", () => {
  it("stamps the scope state hash and the previous operation index", () => {
    const stamped = stampAction(action, createDocument({ global: 7 }));

    expect(stamped.context?.prevOpHash).toBe(
      hashDocumentStateForScope({ state }, "global"),
    );
    expect(stamped.context?.prevOpIndex).toBe(6);
  });

  it("stamps -1 for a scope with no operations", () => {
    const stamped = stampAction(action, createDocument({ global: 0 }));

    expect(stamped.context?.prevOpIndex).toBe(-1);
  });

  it("stamps -1 for a scope the document does not know about", () => {
    const stamped = stampAction(
      { ...action, scope: "local" },
      createDocument({ global: 7 }),
    );

    expect(stamped.context?.prevOpIndex).toBe(-1);
    expect(stamped.context?.prevOpHash).toBe(
      hashDocumentStateForScope({ state }, "local"),
    );
  });

  it("does not mutate the input action", () => {
    stampAction(action, createDocument({ global: 7 }));

    expect(action.context).toBeUndefined();
  });

  it("keeps an existing signer on the context", () => {
    const withSigner: Action = {
      ...action,
      context: {
        signer: {
          user: { address: "0x1", networkId: "eip155", chainId: 1 },
          app: { name: "app", key: "key" },
          signatures: [],
        },
      },
    };

    const stamped = stampAction(withSigner, createDocument({ global: 7 }));

    expect(stamped.context?.signer?.app.name).toBe("app");
  });
});

describe("signStampedAction", () => {
  it("appends the signature under the signer identity", async () => {
    const signer = createSigner();
    const stamped = stampAction(action, createDocument({ global: 7 }));
    const signed = await signStampedAction(stamped, signer);

    expect(signed.context?.signer?.signatures).toEqual([signature]);
    expect(signed.context?.signer?.user).toEqual(signer.user);
    expect(signed.context?.signer?.app).toEqual(signer.app);
    expect(signed.context?.prevOpHash).toBe(stamped.context?.prevOpHash);
  });

  it("preserves signatures the action already carries", async () => {
    const existing: Signature = ["ts0", "did0", "hash0", "prev0", "0xold"];
    const stamped: Action = {
      ...stampAction(action, createDocument({ global: 7 })),
      context: {
        signer: {
          user: { address: "0x2", networkId: "eip155", chainId: 1 },
          app: { name: "other", key: "other-key" },
          signatures: [existing],
        },
      },
    };

    const signed = await signStampedAction(stamped, createSigner());

    expect(signed.context?.signer?.signatures).toEqual([existing, signature]);
    expect(signed.context?.signer?.app.name).toBe("other");
  });

  it("signs the stamped action, not a copy without the stamp", async () => {
    const signer = createSigner();
    const stamped = stampAction(action, createDocument({ global: 7 }));
    await signStampedAction(stamped, signer);

    const argument = vi.mocked(signer.signAction).mock.calls[0][0];
    expect(argument.context?.prevOpHash).toBe(stamped.context?.prevOpHash);
  });

  it("rejects when neither the action nor the signer has an identity", async () => {
    const signer = { signAction: vi.fn() } as unknown as ISigner;
    const stamped = stampAction(action, createDocument({ global: 7 }));

    await expect(signStampedAction(stamped, signer)).rejects.toThrow(
      "no user or app identity",
    );
    expect(signer.signAction).not.toHaveBeenCalled();
  });
});

// A batch is predicted with the REAL built-in document-model reducer: a fake one
// would hide exactly what this helper exists to get right - the state the server
// will hash, and the fact that the reducer's own indices count from an empty
// history rather than from the document's head.
function createSnapshot(revision: Record<string, number>): PHDocument {
  const document = documentModelDocumentModelModule.utils.createDocument();
  const snapshot = {
    header: { ...document.header, revision },
    state: document.state,
    initialState: document.state,
    // What `phDocumentFromGetDocument` produces: the scopes are known, the
    // history is not.
    operations: { global: [], local: [] },
    clipboard: [],
  } as unknown as PHDocument;
  // The GraphQL `PHDocument` type carries no protocol versions, so a real light
  // snapshot never has them either.
  delete (snapshot.header as { protocolVersions?: unknown }).protocolVersions;
  return snapshot;
}

/** Folds the same reducer by hand, to check the chain against something else. */
function foldScopeHashes(
  snapshot: PHDocument,
  batch: readonly Action[],
): string[] {
  let document = snapshot;
  const hashes: string[] = [];
  for (const action of batch) {
    hashes.push(hashDocumentStateForScope(document, "global"));
    document = documentModelDocumentModelModule.reducer(
      document as never,
      action,
      undefined,
      { protocolVersion: 2 },
    ) as unknown as PHDocument;
  }
  return hashes;
}

const batch: Action[] = [
  setModelName({ name: "Invoice" }),
  setModelDescription({ description: "An invoice" }),
  addModule({ id: "module-1", name: "core" }),
];

describe("prepareSignedActions", () => {
  it("signs nothing for an empty batch", async () => {
    await expect(
      prepareSignedActions([], createSnapshot({ global: 5 }), createSigner()),
    ).resolves.toEqual([]);
  });

  it("signs a single action without needing a document model", async () => {
    const signer = createSigner();
    const snapshot = createSnapshot({ global: 7 });

    const [signed] = await prepareSignedActions([action], snapshot, signer);

    expect(signed.context?.prevOpIndex).toBe(6);
    expect(signed.context?.prevOpHash).toBe(
      hashDocumentStateForScope(snapshot, "global"),
    );
    expect(signed.context?.signer?.signatures).toEqual([signature]);
  });

  it("chains prevOpHash across the batch from a history-free snapshot", async () => {
    const snapshot = createSnapshot({ global: 5 });

    const signed = await prepareSignedActions(
      batch,
      snapshot,
      createSigner(),
      documentModelDocumentModelModule,
    );

    expect(signed.map((a) => a.context?.prevOpHash)).toEqual(
      foldScopeHashes(snapshot, batch),
    );
  });

  it("counts prevOpIndex from the document's revision, not the reducer's", async () => {
    const snapshot = createSnapshot({ global: 5 });

    const signed = await prepareSignedActions(
      batch,
      snapshot,
      createSigner(),
      documentModelDocumentModelModule,
    );

    // The simulated operations are indexed 0, 1, 2 because the snapshot has no
    // history; the remote chain continues from revision 5.
    expect(signed.map((a) => a.context?.prevOpIndex)).toEqual([4, 5, 6]);
  });

  it("starts a fresh scope at -1", async () => {
    const signed = await prepareSignedActions(
      batch,
      createSnapshot({ global: 0 }),
      createSigner(),
      documentModelDocumentModelModule,
    );

    expect(signed.map((a) => a.context?.prevOpIndex)).toEqual([-1, 0, 1]);
  });

  it("signs every action in the batch, in order", async () => {
    const signer = createSigner();

    const signed = await prepareSignedActions(
      batch,
      createSnapshot({ global: 5 }),
      signer,
      documentModelDocumentModelModule,
    );

    expect(signer.signAction).toHaveBeenCalledTimes(3);
    expect(signed.map((a) => a.type)).toEqual(batch.map((a) => a.type));
    for (const signedAction of signed) {
      expect(signedAction.context?.signer?.signatures).toEqual([signature]);
    }
  });

  it("signs each action already stamped with its own place in the chain", async () => {
    const signer = createSigner();
    const snapshot = createSnapshot({ global: 5 });

    const signed = await prepareSignedActions(
      batch,
      snapshot,
      signer,
      documentModelDocumentModelModule,
    );

    const signedArguments = vi
      .mocked(signer.signAction)
      .mock.calls.map(([signedAction]) => signedAction);
    expect(signedArguments.map((a) => a.context?.prevOpHash)).toEqual(
      signed.map((a) => a.context?.prevOpHash),
    );
    expect(signedArguments.map((a) => a.context?.prevOpIndex)).toEqual([
      4, 5, 6,
    ]);
  });

  it("mutates neither the snapshot nor the actions it is given", async () => {
    const snapshot = createSnapshot({ global: 5 });
    const before = JSON.stringify(snapshot);
    const actionsBefore = JSON.stringify(batch);

    await prepareSignedActions(
      batch,
      snapshot,
      createSigner(),
      documentModelDocumentModelModule,
    );

    expect(JSON.stringify(snapshot)).toBe(before);
    expect(JSON.stringify(batch)).toBe(actionsBefore);
  });

  it("passes the abort signal to every signer call", async () => {
    const signer = createSigner();
    const controller = new AbortController();

    await prepareSignedActions(
      batch,
      createSnapshot({ global: 5 }),
      signer,
      documentModelDocumentModelModule,
      controller.signal,
    );

    for (const call of vi.mocked(signer.signAction).mock.calls) {
      expect(call[1]).toBe(controller.signal);
    }
  });

  it("stops before signing anything once aborted", async () => {
    const signer = createSigner();
    const controller = new AbortController();
    controller.abort();

    await expect(
      prepareSignedActions(
        batch,
        createSnapshot({ global: 5 }),
        signer,
        documentModelDocumentModelModule,
        controller.signal,
      ),
    ).rejects.toThrow("signing aborted before action 0");
    expect(signer.signAction).not.toHaveBeenCalled();
  });

  it("rejects a batch with no document model instead of sending it unsigned", async () => {
    await expect(
      prepareSignedActions(
        batch,
        createSnapshot({ global: 5 }),
        createSigner(),
      ),
    ).rejects.toThrow("no document model module for powerhouse/document-model");
  });

  it("rejects a batch spanning more than one scope", async () => {
    const mixed = [batch[0], { ...batch[1], scope: "local" }];

    await expect(
      prepareSignedActions(
        mixed,
        createSnapshot({ global: 5 }),
        createSigner(),
        documentModelDocumentModelModule,
      ),
    ).rejects.toThrow('spanning scopes "global" and "local"');
  });

  it.each([
    "UNDO",
    "REDO",
    "PRUNE",
    "NOOP",
    "CREATE_DOCUMENT",
    "DELETE_DOCUMENT",
    "UPGRADE_DOCUMENT",
    "ADD_RELATIONSHIP",
    "REMOVE_RELATIONSHIP",
    "UPDATE_RELATIONSHIP",
  ])("rejects a batch containing %s", async (type) => {
    const withUnsupported = [batch[0], { ...batch[1], type }];

    await expect(
      prepareSignedActions(
        withUnsupported,
        createSnapshot({ global: 5 }),
        createSigner(),
        documentModelDocumentModelModule,
      ),
    ).rejects.toThrow(`cannot sign a batch containing ${type}`);
  });

  it("rejects the batch when the reducer throws", async () => {
    // The real reducer records a bad action as a failed operation rather than
    // throwing (see the test below), so the throwing case needs a stub. It is
    // only ever the escape hatch: a reducer that cannot run at all leaves the
    // rest of the batch unpredictable.
    const throwing = {
      ...documentModelDocumentModelModule,
      reducer: () => {
        throw new Error("boom");
      },
    } as unknown as typeof documentModelDocumentModelModule;

    await expect(
      prepareSignedActions(
        batch,
        createSnapshot({ global: 5 }),
        createSigner(),
        throwing,
      ),
    ).rejects.toThrow(
      "cannot sign action 0 (SET_MODEL_NAME): the powerhouse/document-model reducer rejected it",
    );
  });

  it("rejects the batch when a reducer call appends no operation", async () => {
    // The revision chain is only sound while one action means one operation, so
    // a reducer that quietly swallows an action must not be signed around.
    const swallowing = {
      ...documentModelDocumentModelModule,
      reducer: (document: PHDocument) => document,
    } as unknown as typeof documentModelDocumentModelModule;

    await expect(
      prepareSignedActions(
        batch,
        createSnapshot({ global: 5 }),
        createSigner(),
        swallowing,
      ),
    ).rejects.toThrow("appended 0 operations to global, expected exactly 1");
  });

  it("records a schema-invalid action as a failed operation, not a throw", async () => {
    // ADD_MODULE validates its input inside the state reducer, which baseReducer
    // catches - so this is the recorded-failure path, and the chain survives it.
    const malformed: Action = { ...batch[2], input: { id: undefined } };
    const snapshot = createSnapshot({ global: 5 });

    const signed = await prepareSignedActions(
      [batch[0], malformed, batch[1]],
      snapshot,
      createSigner(),
      documentModelDocumentModelModule,
    );

    expect(signed.map((a) => a.context?.prevOpIndex)).toEqual([4, 5, 6]);
    expect(signed.map((a) => a.context?.prevOpHash)).toEqual(
      foldScopeHashes(snapshot, [batch[0], malformed, batch[1]]),
    );
  });

  it("keeps chaining when the reducer records a failed operation", async () => {
    // `setModuleName` for a module that does not exist leaves the state alone
    // but still appends one operation carrying the error, and the server does
    // the same - so the next action hashes the unchanged state at the next
    // revision, and the batch is still signable.
    const withFailure = [
      batch[0],
      setModuleName({ id: "missing", name: "nope" }),
      batch[1],
    ];
    const snapshot = createSnapshot({ global: 5 });

    const signed = await prepareSignedActions(
      withFailure,
      snapshot,
      createSigner(),
      documentModelDocumentModelModule,
    );

    expect(signed.map((a) => a.context?.prevOpIndex)).toEqual([4, 5, 6]);
    expect(signed[2].context?.prevOpHash).toBe(signed[1].context?.prevOpHash);
    expect(signed.map((a) => a.context?.prevOpHash)).toEqual(
      foldScopeHashes(snapshot, withFailure),
    );
  });
});
