import type {
  Action,
  Grant,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import {
  AuthActionNotAllowedError,
  initializeAuth,
  isAuthAction,
  moveGrant,
  removeGrant,
  replayDocument,
  setGrant,
} from "@powerhousedao/shared/document-model";
import type { CountPHState } from "../helpers.js";
import { countReducer, createCountState } from "../helpers.js";

function makeGrant(id: string): Grant {
  return {
    id,
    description: `grant ${id}`,
    effect: "allow",
    principal: { anyone: true },
    capability: { can: "read", scope: "global" },
  };
}

function rawAction(type: string, scope: string): Action {
  return {
    id: `act-${type}`,
    type,
    scope,
    input: {},
    timestampUtcMs: "2024-01-01T00:00:00Z",
  };
}

function ids(doc: PHDocument<CountPHState>): string[] {
  return doc.state.auth.grants.map((g) => g.id);
}

const initialState = createCountState();
const initialDocument: PHDocument<CountPHState> = {
  header: {
    id: "doc-1",
    sig: { publicKey: {}, nonce: "" },
    documentType: "",
    createdAtUtcIso: "",
    slug: "",
    name: "",
    branch: "",
    revision: { global: 0, local: 0 },
    lastModifiedAtUtcIso: "",
    meta: {},
  },
  state: createCountState(),
  initialState,
  operations: { global: [], local: [] },
  clipboard: [],
};

// Canonical did:key <-> JWK for the same P-256 key. A signed header records the
// creator as a JWK; the signer presents the same key as a did:key.
const CREATOR_DID = "did:key:zDnaexNjCKnPLh5Vhn1KqjmrLDFtXddrtTTE9gJmdWRSCG3wt";
const CREATOR_JWK = {
  kty: "EC",
  crv: "P-256",
  x: "2qGULg46dKXbnsPdvI4AxOHiw94xJRDVAWuyHIyyGd8",
  y: "V_jbfJ-wVhoUspPM9epxaJHUs_6TyMfrOgwB2Kcx170",
};
const OTHER_DID = "did:key:zDnaefv2pj8YQM2T6E3pnrJoGnDGbXsrvJiXhqHzh7d5RzncU";

const signedDocument: PHDocument<CountPHState> = {
  ...initialDocument,
  header: {
    ...initialDocument.header,
    sig: { publicKey: CREATOR_JWK, nonce: "" },
  },
};

function signedInit(appKey: string): Action {
  return {
    ...initializeAuth({ version: 1, grants: [] }),
    context: {
      signer: {
        user: { address: "", networkId: "", chainId: 0 },
        app: { name: "connect", key: appKey },
        signatures: [],
      },
    },
  };
}

describe("auth-scope action creators", () => {
  it("build auth-scoped actions", () => {
    const action = initializeAuth({ version: 1, grants: [] });
    expect(action.type).toBe("INITIALIZE_AUTH");
    expect(action.scope).toBe("auth");
    expect(action.input).toEqual({ version: 1, grants: [] });
    expect(isAuthAction(action)).toBe(true);
    expect(setGrant({ grant: makeGrant("a") }).scope).toBe("auth");
    expect(removeGrant({ id: "a" }).scope).toBe("auth");
    expect(moveGrant({ id: "a", index: 0 }).scope).toBe("auth");
  });
});

describe("auth-scope reducer", () => {
  it("INITIALIZE_AUTH sets the policy and records a hashed auth operation", () => {
    const grant = makeGrant("g1");
    const doc = countReducer(
      initialDocument,
      initializeAuth({ version: 1, grants: [grant] }),
    );
    expect(doc.state.auth).toEqual({ version: 1, grants: [grant] });
    expect(doc.operations.auth).toHaveLength(1);
    expect(doc.operations.auth[0].hash).not.toBe("");
    expect(doc.header.revision.auth).toBe(1);
    // domain scopes are untouched
    expect(doc.state.global).toEqual(initialDocument.state.global);
  });

  it("records the creator when signed by the document creator", () => {
    const doc = countReducer(signedDocument, signedInit(CREATOR_DID));
    expect(doc.state.auth.creator).toBe(CREATOR_DID);
  });

  it("fails closed for a signed header with an unsupported key type", () => {
    const okpDocument: PHDocument<CountPHState> = {
      ...initialDocument,
      header: {
        ...initialDocument.header,
        sig: { publicKey: { kty: "OKP", crv: "Ed25519", x: "abc" }, nonce: "" },
      },
    };
    const doc = countReducer(okpDocument, signedInit(CREATOR_DID));
    expect(doc.state.auth).toStrictEqual({ version: 0, grants: [] });
    expect(doc.operations.auth[0].error).toContain(
      "must be signed by the document creator",
    );
  });

  it("records an error operation for INITIALIZE_AUTH signed by a non-creator", () => {
    const doc = countReducer(signedDocument, signedInit(OTHER_DID));
    expect(doc.state.auth).toStrictEqual({ version: 0, grants: [] });
    expect(doc.operations.auth).toHaveLength(1);
    expect(doc.operations.auth[0].error).toContain(
      "must be signed by the document creator",
    );
  });

  it("initializes an unsigned-header document with no recorded creator", () => {
    const doc = countReducer(
      initialDocument,
      initializeAuth({ version: 1, grants: [] }),
    );
    expect(doc.state.auth.creator).toBeUndefined();
    expect(doc.state.auth).toEqual({ version: 1, grants: [] });
  });

  it("rejects INITIALIZE_AUTH with a version below 1 (0 means uninitialized)", () => {
    expect(() => initializeAuth({ version: 0, grants: [] })).toThrow();

    // a raw action that bypassed the creator's schema is recorded as an error
    // operation by the reducer itself, deterministically on every replica
    const raw: Action = {
      id: "act-init-v0",
      type: "INITIALIZE_AUTH",
      scope: "auth",
      input: { version: 0, grants: [] },
      timestampUtcMs: "2024-01-01T00:00:00Z",
    };
    const doc = countReducer(initialDocument, raw);
    expect(doc.state.auth).toStrictEqual({ version: 0, grants: [] });
    expect(doc.operations.auth[0].error).toContain(
      "requires an integer version >= 1",
    );
  });

  it("records an error operation for a second INITIALIZE_AUTH", () => {
    const doc = countReducer(
      initialDocument,
      initializeAuth({ version: 1, grants: [] }),
    );
    const next = countReducer(doc, initializeAuth({ version: 2, grants: [] }));
    expect(next.state.auth).toStrictEqual({ version: 1, grants: [] });
    expect(next.operations.auth).toHaveLength(2);
    expect(next.operations.auth[1].error).toContain("already initialized");
  });

  it("SET_GRANT appends a new grant and replaces an existing one in place", () => {
    let doc = countReducer(
      initialDocument,
      initializeAuth({ version: 1, grants: [makeGrant("a"), makeGrant("b")] }),
    );
    doc = countReducer(doc, setGrant({ grant: makeGrant("c") }));
    expect(ids(doc)).toEqual(["a", "b", "c"]);

    doc = countReducer(
      doc,
      setGrant({ grant: { ...makeGrant("b"), description: "updated" } }),
    );
    expect(ids(doc)).toEqual(["a", "b", "c"]);
    expect(doc.state.auth.grants[1].description).toBe("updated");
  });

  it("REMOVE_GRANT deletes by id and records an error operation for an unknown id", () => {
    let doc = countReducer(
      initialDocument,
      initializeAuth({ version: 1, grants: [makeGrant("a"), makeGrant("b")] }),
    );
    doc = countReducer(doc, removeGrant({ id: "a" }));
    expect(ids(doc)).toEqual(["b"]);

    const next = countReducer(doc, removeGrant({ id: "zzz" }));
    expect(ids(next)).toEqual(["b"]);
    const ops = next.operations.auth;
    expect(ops[ops.length - 1].error).toContain("Grant not found");
  });

  it("MOVE_GRANT reorders a grant, clamps the index, and throws for an unknown id", () => {
    let doc = countReducer(
      initialDocument,
      initializeAuth({
        version: 1,
        grants: [makeGrant("a"), makeGrant("b"), makeGrant("c")],
      }),
    );
    doc = countReducer(doc, moveGrant({ id: "c", index: 0 }));
    expect(ids(doc)).toEqual(["c", "a", "b"]);

    doc = countReducer(doc, moveGrant({ id: "c", index: 99 }));
    expect(ids(doc)).toEqual(["a", "b", "c"]);

    const next = countReducer(doc, moveGrant({ id: "zzz", index: 0 }));
    expect(ids(next)).toEqual(["a", "b", "c"]);
    const ops = next.operations.auth;
    expect(ops[ops.length - 1].error).toContain("Grant not found");
  });

  it("rejects UNDO, REDO and PRUNE on the auth scope", () => {
    expect(() =>
      countReducer(initialDocument, rawAction("UNDO", "auth")),
    ).toThrow(AuthActionNotAllowedError);
    expect(() =>
      countReducer(initialDocument, rawAction("PRUNE", "auth")),
    ).toThrow(AuthActionNotAllowedError);
    expect(() =>
      countReducer(initialDocument, rawAction("REDO", "auth")),
    ).toThrow(AuthActionNotAllowedError);
  });

  it("replays a history containing an errored auth operation without throwing", () => {
    let doc = countReducer(
      initialDocument,
      initializeAuth({ version: 1, grants: [makeGrant("a")] }),
    );
    doc = countReducer(doc, initializeAuth({ version: 2, grants: [] }));
    expect(doc.operations.auth[1].error).toBeTruthy();

    const replayed = replayDocument(
      initialState,
      doc.operations,
      countReducer,
      doc.header,
      undefined,
      undefined,
      { checkHashes: false },
    );

    expect(replayed.state.auth).toStrictEqual(doc.state.auth);
    expect(replayed.state.auth.version).toBe(1);
    expect(replayed.operations.auth[1].error).toBeTruthy();
  });

  it("replays auth operations to reconstruct the auth state with matching hashes", () => {
    let doc = countReducer(
      initialDocument,
      initializeAuth({ version: 1, grants: [makeGrant("a")] }),
    );
    doc = countReducer(doc, setGrant({ grant: makeGrant("b") }));
    doc = countReducer(doc, moveGrant({ id: "b", index: 0 }));

    const replayed = replayDocument(
      initialState,
      doc.operations,
      countReducer,
      doc.header,
      undefined,
      undefined,
      { checkHashes: false },
    );

    expect(replayed.state.auth).toEqual(doc.state.auth);
    expect(replayed.state.auth.grants.map((g) => g.id)).toEqual(["b", "a"]);
  });
});
