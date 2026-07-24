import type {
  AuthRequest,
  Capability,
  Condition,
  Grant,
  PHAuthState,
  Principal,
} from "@powerhousedao/shared/document-model";
import { decide } from "@powerhousedao/shared/document-model";

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

  it("distinguishes read from execute", () => {
    const executeOnly = policy(
      grant(
        "g",
        "allow",
        { anyone: true },
        { can: "execute", scope: "global" },
      ),
    );
    expect(decide(executeOnly, {}, { verb: "read", scope: "global" })).toBe(
      "deny",
    );

    const readOnly = policy(
      grant("g", "allow", { anyone: true }, { can: "read", scope: "global" }),
    );
    expect(decide(readOnly, {}, { verb: "read", scope: "global" })).toBe(
      "allow",
    );
    expect(decide(readOnly, {}, execGlobal)).toBe("deny");
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
