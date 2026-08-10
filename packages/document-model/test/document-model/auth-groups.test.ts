import type {
  AuthGroups,
  AuthRequest,
  Capability,
  Grant,
  PHAuthState,
  Principal,
} from "@powerhousedao/shared/document-model";
import {
  decide,
  evaluate,
  initializeAuth,
  mentionedGroupIds,
  moveGrant,
  referencedGroupIds,
  removeGrant,
  setGrant,
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

const groupAllow = grant(
  "g-las",
  "allow",
  { group: "phd-las" },
  { can: "execute", scope: "global" },
);

describe("group principals in decide", () => {
  it("matches a member of a supplied group, case-insensitively", () => {
    const groups: AuthGroups = { "phd-las": { members: ["0xAbC1"] } };
    expect(
      decide(policy(groupAllow), { address: "0XABC1" }, execGlobal, groups),
    ).toBe("allow");
  });

  it("never applies without a groups map", () => {
    const evaluation = evaluate(
      policy(groupAllow),
      { address: "0xabc1" },
      execGlobal,
    );
    expect(evaluation).toEqual({
      decision: "deny",
      refusal: "no-applicable-grant",
    });
  });

  it("fails closed for a group the map does not hold", () => {
    const groups: AuthGroups = {};
    expect(
      decide(policy(groupAllow), { address: "0xabc1" }, execGlobal, groups),
    ).toBe("deny");
  });

  it("never matches an anonymous subject", () => {
    const groups: AuthGroups = { "phd-las": { members: ["0xabc1"] } };
    expect(decide(policy(groupAllow), {}, execGlobal, groups)).toBe("deny");
  });

  it("does not match a non-member", () => {
    const groups: AuthGroups = { "phd-las": { members: ["0xother"] } };
    expect(
      decide(policy(groupAllow), { address: "0xabc1" }, execGlobal, groups),
    ).toBe("deny");
  });

  it("applies a group-scoped deny over an earlier allow", () => {
    const groups: AuthGroups = { "phd-banned": { members: ["0xabc1"] } };
    const auth = policy(
      grant("g-open", "allow", { anyone: true }, { can: "execute" }),
      grant(
        "g-ban",
        "deny",
        { group: "phd-banned" },
        { can: "execute", scope: "global" },
      ),
    );
    const evaluation = evaluate(
      auth,
      { address: "0xABC1" },
      execGlobal,
      groups,
    );
    expect(evaluation).toEqual({
      decision: "deny",
      refusal: "denied-by-grant",
      grantId: "g-ban",
    });
  });

  it("tolerates a malformed group state without widening access", () => {
    const groups = {
      "phd-las": { members: undefined },
    } as unknown as AuthGroups;
    expect(
      decide(policy(groupAllow), { address: "0xabc1" }, execGlobal, groups),
    ).toBe("deny");
  });
});

describe("referencedGroupIds", () => {
  it("collects group ids in order of first appearance, deduplicated", () => {
    const grants = [
      grant("g1", "allow", { group: "b" }, { can: "read" }),
      grant("g2", "allow", { address: "0x1" }, { can: "read" }),
      grant("g3", "deny", { group: "a" }, { can: "execute" }),
      grant("g4", "allow", { group: "b" }, { can: "execute" }),
    ];
    expect(referencedGroupIds(grants)).toEqual(["b", "a"]);
  });

  it("returns nothing for a policy without group principals", () => {
    expect(
      referencedGroupIds([
        grant("g1", "allow", { anyone: true }, { can: "read" }),
      ]),
    ).toEqual([]);
  });
});

describe("mentionedGroupIds", () => {
  it("collects groups across an INITIALIZE_AUTH input", () => {
    const action = initializeAuth({
      version: 1,
      grants: [
        grant("g1", "allow", { group: "a" }, { can: "read" }),
        grant("g2", "allow", { group: "b" }, { can: "read" }),
        grant("g3", "allow", { group: "a" }, { can: "execute" }),
      ],
    });
    expect(mentionedGroupIds(action)).toEqual(["a", "b"]);
  });

  it("collects the one grant of a SET_GRANT input", () => {
    const action = setGrant({
      grant: grant("g1", "allow", { group: "phd-las" }, { can: "read" }),
    });
    expect(mentionedGroupIds(action)).toEqual(["phd-las"]);
  });

  it("contributes nothing for REMOVE_GRANT and MOVE_GRANT", () => {
    expect(mentionedGroupIds(removeGrant({ id: "g1" }))).toEqual([]);
    expect(mentionedGroupIds(moveGrant({ id: "g1", index: 0 }))).toEqual([]);
  });

  it("is total over malformed input", () => {
    const malformed = {
      type: "SET_GRANT",
      input: { grant: { principal: { group: 42 } } },
    } as never;
    expect(mentionedGroupIds(malformed)).toEqual([]);
    const nullInput = { type: "INITIALIZE_AUTH", input: null } as never;
    expect(mentionedGroupIds(nullInput)).toEqual([]);
  });
});
