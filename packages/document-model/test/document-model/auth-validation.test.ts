import type {
  Action,
  Condition,
  Grant,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import type { PHAuthState } from "@powerhousedao/shared/document-model";
import {
  assertAuthPreservedOnDuplicate,
  AuthPolicyNotPreservedError,
  groupDocumentType,
  initializeAuth,
  MAX_AUTH_GRANTS,
  setGrant,
} from "@powerhousedao/shared/document-model";
import type { CountPHState } from "../helpers.js";
import { countReducer, createCountState } from "../helpers.js";

function makeGrant(id: string, overrides?: Partial<Grant>): Grant {
  return {
    id,
    description: `grant ${id}`,
    effect: "allow",
    principal: { anyone: true },
    capability: { can: "read", scope: "global" },
    ...overrides,
  };
}

function rawSetGrant(grant: unknown): Action {
  return {
    id: `act-set-${JSON.stringify(grant).length}`,
    type: "SET_GRANT",
    scope: "auth",
    input: { grant },
    timestampUtcMs: "2024-01-01T00:00:00Z",
  };
}

function rawInitializeAuth(grants: unknown): Action {
  return {
    id: "act-init-raw",
    type: "INITIALIZE_AUTH",
    scope: "auth",
    input: { version: 1, grants },
    timestampUtcMs: "2024-01-01T00:00:00Z",
  };
}

function makeDocument(documentType = ""): PHDocument<CountPHState> {
  return {
    header: {
      id: "doc-1",
      sig: { publicKey: {}, nonce: "" },
      documentType,
      createdAtUtcIso: "",
      slug: "",
      name: "",
      branch: "",
      revision: { global: 0, local: 0 },
      lastModifiedAtUtcIso: "",
      meta: {},
    },
    state: createCountState(),
    initialState: createCountState(),
    operations: { global: [], local: [] },
    clipboard: [],
  };
}

function initializedDocument(grants: Grant[] = []): PHDocument<CountPHState> {
  return countReducer(makeDocument(), initializeAuth({ version: 1, grants }));
}

function lastAuthError(doc: PHDocument<CountPHState>): string | undefined {
  const ops = doc.operations.auth ?? [];
  return ops[ops.length - 1]?.error;
}

function nestedNot(depth: number): Condition {
  let condition: Condition = {
    eq: [{ attr: "doc.global.count" }, { lit: 1 }],
  };
  for (let i = 0; i < depth; i++) {
    condition = { not: condition };
  }
  return condition;
}

function wideAnd(comparisons: number): Condition {
  const eq: Condition = { eq: [{ lit: 1 }, { lit: 1 }] };
  return { and: Array.from({ length: comparisons }, () => eq) };
}

describe("auth-scope v1 grant validation", () => {
  it("accepts a fully-specified conditional grant", () => {
    const grant = makeGrant("g1", {
      principal: {
        match: { eq: [{ attr: "subject.address" }, { lit: "0xa" }] },
      },
      capability: { can: "execute", scope: "global", operation: ["SET_STATE"] },
      where: { exists: { attr: "doc.global.count" } },
    });
    const doc = countReducer(initializedDocument(), rawSetGrant(grant));
    expect(lastAuthError(doc)).toBeUndefined();
    expect(doc.state.auth.grants.map((g) => g.id)).toEqual(["g1"]);
  });

  it("records an error operation for a malformed principal", () => {
    const doc = countReducer(
      initializedDocument(),
      rawSetGrant(
        makeGrant("g1", { principal: {} as unknown as Grant["principal"] }),
      ),
    );
    expect(lastAuthError(doc)).toContain(
      "principal must have exactly one of anyone, address, group, or match",
    );
    expect(doc.state.auth.grants).toEqual([]);
  });

  it("records an error operation for an unknown grant key", () => {
    const grant = { ...makeGrant("g1"), extra: true };
    const doc = countReducer(initializedDocument(), rawSetGrant(grant));
    expect(lastAuthError(doc)).toContain('unknown grant key "extra"');
  });

  it("reports the alphabetically first unknown key regardless of insertion order", () => {
    // jsonb storage does not preserve key order
    const grant = { ...makeGrant("g1"), zz: 1, bb: 2 };
    const doc = countReducer(initializedDocument(), rawSetGrant(grant));
    expect(lastAuthError(doc)).toContain('unknown grant key "bb"');
  });

  it("records a deterministic error operation for a null action input", () => {
    const nullSetGrant: Action = {
      id: "act-null-input",
      type: "SET_GRANT",
      scope: "auth",
      input: null as unknown as { grant: Grant },
      timestampUtcMs: "2024-01-01T00:00:00Z",
    };
    const doc = countReducer(initializedDocument(), nullSetGrant);
    expect(lastAuthError(doc)).toContain("Invalid action input");

    const nullInit: Action = {
      id: "act-null-init",
      type: "INITIALIZE_AUTH",
      scope: "auth",
      input: null as unknown as { version: number; grants: Grant[] },
      timestampUtcMs: "2024-01-01T00:00:00Z",
    };
    const initDoc = countReducer(makeDocument(), nullInit);
    expect(lastAuthError(initDoc)).toContain("Invalid action input");
    expect(initDoc.state.auth.version).toBe(0);
  });

  it("caps the execute capability operation list", () => {
    const atCap = countReducer(
      initializedDocument(),
      rawSetGrant(
        makeGrant("g1", {
          capability: {
            can: "execute",
            scope: "global",
            operation: Array.from({ length: 100 }, (_, i) => `OP_${i}`),
          },
        }),
      ),
    );
    expect(lastAuthError(atCap)).toBeUndefined();

    const overCap = countReducer(
      initializedDocument(),
      rawSetGrant(
        makeGrant("g1", {
          capability: {
            can: "execute",
            scope: "global",
            operation: Array.from({ length: 101 }, (_, i) => `OP_${i}`),
          },
        }),
      ),
    );
    expect(lastAuthError(overCap)).toContain(
      "capability.operation exceeds 100 entries",
    );
  });

  it("records an error operation for an invalid capability", () => {
    const doc = countReducer(
      initializedDocument(),
      rawSetGrant(
        makeGrant("g1", {
          capability: { can: "write" } as unknown as Grant["capability"],
        }),
      ),
    );
    expect(lastAuthError(doc)).toContain(
      "capability.can must be read or execute",
    );
  });

  it("rejects an operation list on a read capability", () => {
    const doc = countReducer(
      initializedDocument(),
      rawSetGrant(
        makeGrant("g1", {
          capability: {
            can: "read",
            operation: ["SET_STATE"],
          } as unknown as Grant["capability"],
        }),
      ),
    );
    expect(lastAuthError(doc)).toContain('unknown capability key "operation"');
  });

  it("validates grants carried by INITIALIZE_AUTH", () => {
    const doc = countReducer(
      makeDocument(),
      rawInitializeAuth([makeGrant("g1", { effect: "maybe" as "allow" })]),
    );
    expect(lastAuthError(doc)).toContain("effect must be allow or deny");
    expect(doc.state.auth.version).toBe(0);
  });

  it("caps the number of grants at initialization", () => {
    const grants = Array.from({ length: MAX_AUTH_GRANTS + 1 }, (_, i) =>
      makeGrant(`g${i}`),
    );
    const doc = countReducer(makeDocument(), rawInitializeAuth(grants));
    expect(lastAuthError(doc)).toContain(
      `policy exceeds ${MAX_AUTH_GRANTS} grants`,
    );
    expect(doc.state.auth.version).toBe(0);
  });

  it("caps the number of grants on append but allows replacement at the cap", () => {
    const grants = Array.from({ length: MAX_AUTH_GRANTS }, (_, i) =>
      makeGrant(`g${i}`),
    );
    const doc = initializedDocument(grants);
    expect(doc.state.auth.grants).toHaveLength(MAX_AUTH_GRANTS);

    const appended = countReducer(doc, rawSetGrant(makeGrant("overflow")));
    expect(lastAuthError(appended)).toContain(
      `policy exceeds ${MAX_AUTH_GRANTS} grants`,
    );

    const replaced = countReducer(
      doc,
      setGrant({ grant: makeGrant("g0", { description: "updated" }) }),
    );
    expect(lastAuthError(replaced)).toBeUndefined();
    expect(replaced.state.auth.grants[0].description).toBe("updated");
  });

  it("caps condition depth", () => {
    const ok = countReducer(
      initializedDocument(),
      rawSetGrant(makeGrant("g1", { where: nestedNot(9) })),
    );
    expect(lastAuthError(ok)).toBeUndefined();

    const tooDeep = countReducer(
      initializedDocument(),
      rawSetGrant(makeGrant("g1", { where: nestedNot(10) })),
    );
    expect(lastAuthError(tooDeep)).toContain("condition exceeds depth 10");
  });

  it("caps condition node count", () => {
    const ok = countReducer(
      initializedDocument(),
      rawSetGrant(makeGrant("g1", { where: wideAnd(33) })),
    );
    expect(lastAuthError(ok)).toBeUndefined();

    const tooWide = countReducer(
      initializedDocument(),
      rawSetGrant(makeGrant("g1", { where: wideAnd(34) })),
    );
    expect(lastAuthError(tooWide)).toContain("condition exceeds 100 nodes");
  });

  it("rejects a condition path reading a scope other than the capability's own", () => {
    const crossScope = countReducer(
      initializedDocument(),
      rawSetGrant(
        makeGrant("g1", {
          where: { exists: { attr: "doc.local.count" } },
        }),
      ),
    );
    expect(lastAuthError(crossScope)).toContain(
      'condition path "doc.local.count" reads scope "local" but the capability covers only scope "global"',
    );

    const sameScope = countReducer(
      initializedDocument(),
      rawSetGrant(
        makeGrant("g1", { where: { exists: { attr: "doc.global.count" } } }),
      ),
    );
    expect(lastAuthError(sameScope)).toBeUndefined();

    const subjectPath = countReducer(
      initializedDocument(),
      rawSetGrant(
        makeGrant("g1", { where: { exists: { attr: "subject.address" } } }),
      ),
    );
    expect(lastAuthError(subjectPath)).toBeUndefined();
  });

  it("allows any doc path under a wildcard or omitted capability scope", () => {
    const wildcard = countReducer(
      initializedDocument(),
      rawSetGrant(
        makeGrant("g1", {
          capability: { can: "read", scope: "*" },
          where: { exists: { attr: "doc.local.count" } },
        }),
      ),
    );
    expect(lastAuthError(wildcard)).toBeUndefined();

    const omitted = countReducer(
      initializedDocument(),
      rawSetGrant(
        makeGrant("g1", {
          capability: { can: "read" },
          where: { exists: { attr: "doc.local.count" } },
        }),
      ),
    );
    expect(lastAuthError(omitted)).toBeUndefined();
  });

  it("applies the cross-scope rule to match principals", () => {
    const doc = countReducer(
      initializedDocument(),
      rawSetGrant(
        makeGrant("g1", {
          principal: {
            match: {
              eq: [{ attr: "doc.local.owner" }, { attr: "subject.address" }],
            },
          },
        }),
      ),
    );
    expect(lastAuthError(doc)).toContain('condition path "doc.local.owner"');
  });

  it("rejects malformed conditions", () => {
    const twoKeys = countReducer(
      initializedDocument(),
      rawSetGrant(
        makeGrant("g1", {
          where: {
            eq: [{ lit: 1 }, { lit: 1 }],
            ne: [{ lit: 1 }, { lit: 2 }],
          } as unknown as Condition,
        }),
      ),
    );
    expect(lastAuthError(twoKeys)).toContain(
      "condition must have exactly one operator",
    );

    const badOperand = countReducer(
      initializedDocument(),
      rawSetGrant(
        makeGrant("g1", {
          where: { exists: { attr: "" } } as unknown as Condition,
        }),
      ),
    );
    expect(lastAuthError(badOperand)).toContain(
      "attr must be a non-empty string",
    );

    const badLit = countReducer(
      initializedDocument(),
      rawSetGrant(
        makeGrant("g1", {
          where: { exists: { lit: { nested: true } } } as unknown as Condition,
        }),
      ),
    );
    expect(lastAuthError(badLit)).toContain(
      "lit must be a string, number, boolean, or null",
    );

    const nonFiniteLit = countReducer(
      initializedDocument(),
      rawSetGrant(makeGrant("g1", { where: { exists: { lit: NaN } } })),
    );
    expect(lastAuthError(nonFiniteLit)).toContain(
      "lit must be a finite number",
    );

    const negativeZeroLit = countReducer(
      initializedDocument(),
      rawSetGrant(makeGrant("g1", { where: { exists: { lit: -0 } } })),
    );
    expect(lastAuthError(negativeZeroLit)).toContain(
      "lit must not be negative zero",
    );
  });

  it("the action creator rejects invalid grants before they reach the reducer", () => {
    expect(() =>
      setGrant({
        grant: makeGrant("g1", {
          principal: {} as unknown as Grant["principal"],
        }),
      }),
    ).toThrow();
    expect(() =>
      initializeAuth({
        version: 1,
        grants: [makeGrant("g1", { effect: "maybe" as "allow" })],
      }),
    ).toThrow();
  });
});

describe("auth-scope group document restriction", () => {
  it("rejects group principals on a group document at initialization", () => {
    const doc = countReducer(
      makeDocument(groupDocumentType),
      rawInitializeAuth([
        makeGrant("g1", { principal: { group: "phd-other" } }),
      ]),
    );
    expect(lastAuthError(doc)).toContain(
      "a group's auth scope cannot reference other groups",
    );
    expect(doc.state.auth.version).toBe(0);
  });

  it("rejects group principals on a group document via SET_GRANT", () => {
    const doc = countReducer(
      makeDocument(groupDocumentType),
      initializeAuth({ version: 1, grants: [] }),
    );
    const next = countReducer(
      doc,
      rawSetGrant(makeGrant("g1", { principal: { group: "phd-other" } })),
    );
    expect(lastAuthError(next)).toContain(
      "a group's auth scope cannot reference other groups",
    );
    expect(next.state.auth.grants).toEqual([]);
  });

  it("allows non-group principals on a group document", () => {
    const doc = countReducer(
      makeDocument(groupDocumentType),
      rawInitializeAuth([makeGrant("g1", { principal: { address: "0xa" } })]),
    );
    expect(lastAuthError(doc)).toBeUndefined();
    expect(doc.state.auth.grants.map((g) => g.id)).toEqual(["g1"]);
  });

  it("allows group principals on a non-group document", () => {
    const doc = countReducer(
      makeDocument("test/statement"),
      rawInitializeAuth([makeGrant("g1", { principal: { group: "phd-las" } })]),
    );
    expect(lastAuthError(doc)).toBeUndefined();
    expect(doc.state.auth.grants.map((g) => g.id)).toEqual(["g1"]);
  });
});

describe("assertAuthPreservedOnDuplicate", () => {
  const signedPolicy: PHAuthState = {
    version: 1,
    grants: [makeGrant("a")],
    creator: "did:key:zCreator",
  };
  const unsignedPolicy: PHAuthState = { version: 1, grants: [makeGrant("a")] };

  it("passes when there is nothing to preserve", () => {
    const uninitialized: PHAuthState = { version: 0, grants: [] };
    expect(() =>
      assertAuthPreservedOnDuplicate("doc-1", uninitialized, undefined),
    ).not.toThrow();
    expect(() =>
      assertAuthPreservedOnDuplicate("doc-1", undefined, undefined),
    ).not.toThrow();
  });

  it("passes when the copy carries the same version and creator", () => {
    expect(() =>
      assertAuthPreservedOnDuplicate("doc-1", signedPolicy, {
        ...signedPolicy,
      }),
    ).not.toThrow();
    expect(() =>
      assertAuthPreservedOnDuplicate("doc-1", unsignedPolicy, {
        ...unsignedPolicy,
      }),
    ).not.toThrow();
  });

  it("throws when the copy loses the creator binding", () => {
    expect(() =>
      assertAuthPreservedOnDuplicate("doc-1", signedPolicy, {
        version: 1,
        grants: [makeGrant("a")],
      }),
    ).toThrow(AuthPolicyNotPreservedError);
  });

  it("throws when the copy drops the policy entirely", () => {
    expect(() =>
      assertAuthPreservedOnDuplicate("doc-1", signedPolicy, {
        version: 0,
        grants: [],
      }),
    ).toThrow(AuthPolicyNotPreservedError);
    expect(() =>
      assertAuthPreservedOnDuplicate("doc-1", unsignedPolicy, undefined),
    ).toThrow(AuthPolicyNotPreservedError);
  });
});
