import type {
  AuthRequest,
  Capability,
  Condition,
  Grant,
  PHAuthState,
  Principal,
} from "@powerhousedao/shared/document-model";
import {
  decide,
  evaluate,
  MAX_SUPPORTED_AUTH_VERSION,
} from "@powerhousedao/shared/document-model";

function grant(
  id: string,
  effect: "allow" | "deny",
  principal: Principal,
  capability: Capability,
): Grant {
  return { id, description: id, effect, principal, capability };
}

function policy(...grants: Grant[]): PHAuthState {
  return { version: 1, grants };
}

const execGlobal: AuthRequest = {
  verb: "execute",
  scope: "global",
  operation: "SET_STATUS",
};

describe("decide", () => {
  it("leaves an uninitialized policy open (legacy)", () => {
    const uninit: PHAuthState = { version: 0, grants: [] };
    expect(decide(uninit, {}, execGlobal)).toBe("allow");
    expect(decide(uninit, { address: "0xabc" }, execGlobal)).toBe("allow");
  });

  it("treats a legacy pre-version auth scope ({}) as uninitialized", () => {
    // documents serialized before PHAuthState had a version carry auth: {},
    // which is permanent history (e.g. UPGRADE_DOCUMENT initialState snapshots)
    const legacy = {} as PHAuthState;
    expect(decide(legacy, {}, execGlobal)).toBe("allow");
    expect(decide(legacy, { address: "0xabc" }, execGlobal)).toBe("allow");
    expect(decide(legacy, {}, { verb: "read", scope: "global" })).toBe("allow");
  });

  it("defaults to deny once a policy exists", () => {
    expect(decide(policy(), { address: "0xabc" }, execGlobal)).toBe("deny");
  });

  it("allows when an allow grant matches (anyone, scope, verb)", () => {
    const p = policy(
      grant(
        "g",
        "allow",
        { anyone: true },
        { can: "execute", scope: "global" },
      ),
    );
    expect(decide(p, {}, execGlobal)).toBe("allow");
  });

  it("matches an address principal case-insensitively", () => {
    const p = policy(
      grant(
        "g",
        "allow",
        { address: "0xABC" },
        { can: "execute", scope: "global" },
      ),
    );
    expect(decide(p, { address: "0xabc" }, execGlobal)).toBe("allow");
    expect(decide(p, { address: "0xdef" }, execGlobal)).toBe("deny");
    expect(decide(p, {}, execGlobal)).toBe("deny");
  });

  it("applies grants as a stack (last applicable grant wins)", () => {
    // deny-all, then allow a subset -> the later allow wins
    const denyThenAllow = policy(
      grant(
        "deny-all",
        "deny",
        { anyone: true },
        { can: "execute", scope: "*" },
      ),
      grant(
        "allow-global",
        "allow",
        { anyone: true },
        { can: "execute", scope: "global" },
      ),
    );
    expect(decide(denyThenAllow, {}, execGlobal)).toBe("allow");

    // allow, then a terminal deny freeze -> the later deny wins
    const allowThenDeny = policy(
      grant(
        "allow-global",
        "allow",
        { anyone: true },
        { can: "execute", scope: "global" },
      ),
      grant(
        "freeze",
        "deny",
        { anyone: true },
        { can: "execute", scope: "global", operation: ["SET_STATUS"] },
      ),
    );
    expect(decide(allowThenDeny, {}, execGlobal)).toBe("deny");
  });

  it("honors scope wildcard and rejects scope mismatch", () => {
    const wildcard = policy(
      grant("g", "allow", { anyone: true }, { can: "execute", scope: "*" }),
    );
    expect(decide(wildcard, {}, execGlobal)).toBe("allow");

    const otherScope = policy(
      grant("g", "allow", { anyone: true }, { can: "execute", scope: "local" }),
    );
    expect(decide(otherScope, {}, execGlobal)).toBe("deny");
  });

  it("scopes execute grants by operation list (omitted = all)", () => {
    const listed = policy(
      grant(
        "g",
        "allow",
        { anyone: true },
        { can: "execute", scope: "global", operation: ["SET_STATUS"] },
      ),
    );
    expect(decide(listed, {}, execGlobal)).toBe("allow");
    expect(
      decide(
        listed,
        {},
        { verb: "execute", scope: "global", operation: "OTHER" },
      ),
    ).toBe("deny");

    const allOps = policy(
      grant(
        "g",
        "allow",
        { anyone: true },
        { can: "execute", scope: "global" },
      ),
    );
    expect(
      decide(
        allOps,
        {},
        { verb: "execute", scope: "global", operation: "OTHER" },
      ),
    ).toBe("allow");
  });

  /**
   * Executing an operation means reading the state it applies to, so an allow on
   * execute carries the read with it. The converse does not hold: reading a
   * scope is the lesser power and confers no write.
   */
  it("lets an execute grant confer read, and not the reverse", () => {
    const executeOnly = policy(
      grant(
        "g",
        "allow",
        { anyone: true },
        { can: "execute", scope: "global" },
      ),
    );
    expect(decide(executeOnly, {}, { verb: "read", scope: "global" })).toBe(
      "allow",
    );

    const readOnly = policy(
      grant("g", "allow", { anyone: true }, { can: "read", scope: "global" }),
    );
    expect(decide(readOnly, {}, { verb: "read", scope: "global" })).toBe(
      "allow",
    );
    expect(decide(readOnly, {}, execGlobal)).toBe("deny");
  });

  it("carries an execute grant's read no further than its own scope", () => {
    const executeGlobal = policy(
      grant(
        "g",
        "allow",
        { anyone: true },
        { can: "execute", scope: "global" },
      ),
    );

    expect(decide(executeGlobal, {}, { verb: "read", scope: "global" })).toBe(
      "allow",
    );
    expect(decide(executeGlobal, {}, { verb: "read", scope: "other" })).toBe(
      "deny",
    );
  });

  /**
   * A deny on execute withholds the write and says nothing about the read.
   * Otherwise a policy locking writes down would silently revoke a read grant
   * standing before it, since the last applicable grant wins.
   */
  it("does not let a deny on execute revoke a read", () => {
    const lockedDown = policy(
      grant(
        "g-read",
        "allow",
        { anyone: true },
        { can: "read", scope: "global" },
      ),
      grant("g-lock", "deny", { anyone: true }, { can: "execute", scope: "*" }),
    );

    expect(decide(lockedDown, {}, { verb: "read", scope: "global" })).toBe(
      "allow",
    );
    expect(decide(lockedDown, {}, execGlobal)).toBe("deny");
  });

  /**
   * The operation list restricts which operations may be executed, not whether
   * the scope is visible, and a read carries no operation to match against. A
   * narrowed execute grant would otherwise confer less read than a broad one.
   */
  it("confers read from an execute grant limited to some operations", () => {
    const someOps = policy(
      grant(
        "g",
        "allow",
        { anyone: true },
        { can: "execute", scope: "global", operation: ["SET_STATUS"] },
      ),
    );

    expect(decide(someOps, {}, { verb: "read", scope: "global" })).toBe(
      "allow",
    );
  });

  it("does not yet evaluate where conditions (conditional grant never applies)", () => {
    const whenTerminal: Condition = {
      eq: [{ attr: "doc.global.status" }, { lit: "APPROVED" }],
    };

    // a conditional allow does not widen access
    const conditionalAllow = policy({
      ...grant(
        "g",
        "allow",
        { anyone: true },
        { can: "execute", scope: "global" },
      ),
      where: whenTerminal,
    });
    expect(decide(conditionalAllow, {}, execGlobal)).toBe("deny");

    // a conditional deny does not fire; the unconditional allow stands
    const conditionalDeny = policy(
      grant(
        "allow-all",
        "allow",
        { anyone: true },
        { can: "execute", scope: "global" },
      ),
      {
        ...grant(
          "freeze",
          "deny",
          { anyone: true },
          { can: "execute", scope: "global" },
        ),
        where: whenTerminal,
      },
    );
    expect(decide(conditionalDeny, {}, execGlobal)).toBe("allow");
  });

  it("fails closed on a policy version newer than the software supports", () => {
    const futurePolicy: PHAuthState = {
      version: 2,
      grants: [
        grant("g", "allow", { anyone: true }, { can: "execute", scope: "*" }),
      ],
      creator: "did:key:zCreator",
    };
    // every request is denied, even ones the grant list would allow
    expect(decide(futurePolicy, { address: "0xabc" }, execGlobal)).toBe("deny");
    expect(
      decide(
        futurePolicy,
        { address: "0xabc" },
        { verb: "read", scope: "global" },
      ),
    ).toBe("deny");
    // except the creator's administration of the auth scope
    expect(
      decide(
        futurePolicy,
        { key: "did:key:zCreator" },
        { verb: "execute", scope: "auth", operation: "SET_GRANT" },
      ),
    ).toBe("allow");
  });

  it("does not yet match group or condition principals (grant never applies)", () => {
    const groupPolicy = policy(
      grant(
        "g",
        "allow",
        { group: "phd:group" },
        { can: "execute", scope: "global" },
      ),
    );
    expect(decide(groupPolicy, { address: "0xabc" }, execGlobal)).toBe("deny");

    const matchPolicy = policy(
      grant(
        "g",
        "allow",
        { match: { eq: [{ attr: "subject.address" }, { lit: "0xabc" }] } },
        { can: "execute", scope: "global" },
      ),
    );
    expect(decide(matchPolicy, { address: "0xabc" }, execGlobal)).toBe("deny");
  });
});

/**
 * `decide` reports only the outcome. An operation records why it was refused, so
 * each of the policy's ways of refusing has to be distinguishable.
 */
describe("evaluate", () => {
  it("allows an uninitialized policy with no refusal", () => {
    expect(evaluate({ version: 0, grants: [] }, {}, execGlobal)).toEqual({
      decision: "allow",
    });
  });

  it("names an unsupported policy version", () => {
    const futurePolicy: PHAuthState = {
      version: MAX_SUPPORTED_AUTH_VERSION + 1,
      grants: [
        grant("g", "allow", { anyone: true }, { can: "execute", scope: "*" }),
      ],
    };

    expect(evaluate(futurePolicy, { address: "0xabc" }, execGlobal)).toEqual({
      decision: "deny",
      refusal: "version-unsupported",
    });
  });

  it("keeps the creator carve-out ahead of the version gate", () => {
    const futurePolicy: PHAuthState = {
      version: MAX_SUPPORTED_AUTH_VERSION + 1,
      grants: [],
      creator: "did:key:zCreator",
    };

    expect(
      evaluate(
        futurePolicy,
        { key: "did:key:zCreator" },
        { verb: "execute", scope: "auth", operation: "SET_GRANT" },
      ),
    ).toEqual({ decision: "allow" });
  });

  it("distinguishes no applicable grant from an explicit deny", () => {
    const noneApply = policy(
      grant(
        "g-other",
        "allow",
        { address: "0xsomeone-else" },
        { can: "execute", scope: "global" },
      ),
    );
    expect(evaluate(noneApply, { address: "0xabc" }, execGlobal)).toEqual({
      decision: "deny",
      refusal: "no-applicable-grant",
    });

    const explicitDeny = policy(
      grant(
        "g-allow",
        "allow",
        { anyone: true },
        { can: "execute", scope: "*" },
      ),
      grant("g-deny", "deny", { anyone: true }, { can: "execute", scope: "*" }),
    );
    expect(evaluate(explicitDeny, { address: "0xabc" }, execGlobal)).toEqual({
      decision: "deny",
      refusal: "denied-by-grant",
      grantId: "g-deny",
    });
  });

  it("reports an empty grant list as no applicable grant", () => {
    expect(evaluate(policy(), { address: "0xabc" }, execGlobal)).toEqual({
      decision: "deny",
      refusal: "no-applicable-grant",
    });
  });

  // The two must not drift: decide is evaluate with the reason dropped.
  it("agrees with decide on every case in this file's fixtures", () => {
    const cases: Array<[PHAuthState, { address?: string; key?: string }]> = [
      [{ version: 0, grants: [] }, {}],
      [policy(), { address: "0xabc" }],
      [
        policy(
          grant("g", "allow", { anyone: true }, { can: "execute", scope: "*" }),
        ),
        { address: "0xabc" },
      ],
      [
        policy(
          grant("g", "deny", { anyone: true }, { can: "execute", scope: "*" }),
        ),
        { address: "0xabc" },
      ],
      [
        {
          version: MAX_SUPPORTED_AUTH_VERSION + 1,
          grants: [],
          creator: "did:key:zCreator",
        },
        { key: "did:key:zCreator" },
      ],
    ];

    for (const [auth, subject] of cases) {
      expect(evaluate(auth, subject, execGlobal).decision).toBe(
        decide(auth, subject, execGlobal),
      );
    }
  });
});
