import type {
  AuthGroups,
  Condition,
  Grant,
} from "@powerhousedao/shared/document-model";
import {
  assertAuthAdministrationRetained,
  assertValidInitialGrants,
  evaluateGrantStack,
  grantProblem,
  MAX_AUTH_GRANTS,
  MAX_CONDITION_DEPTH,
  MAX_CONDITION_NODES,
} from "@powerhousedao/shared/document-model";
import { describe, expect, it } from "vitest";
import {
  adversarialAdminGrants,
  AUTH_LEVELS,
  BENCH_ADMIN_ADDRESS,
  BENCH_OUTSIDER_ADDRESS,
  BENCH_WRITER_ADDRESS,
  buildAuthState,
  buildGrants,
  conditionTree,
  countConditionNodes,
  flagsFor,
  groupMembers,
  MINIMAL_SHAPE,
  policiedAt,
  type PolicyShape,
} from "../../bench/fixtures/auth-policies.js";
import { resolveFeatureFlags } from "../../src/core/feature-flags.js";

const DOC_TYPE = "powerhouse/document-model";
const EXECUTE_GLOBAL = {
  verb: "execute" as const,
  scope: "global",
  operation: "SET_MODEL_NAME",
};

function shape(overrides: Partial<PolicyShape>): PolicyShape {
  return { ...MINIMAL_SHAPE, ...overrides };
}

/**
 * A benchmark that measures a fast path, a rejection, or a silently
 * fail-closed principal reports a number about nothing. These assertions are
 * the harness's own guard: they fail loudly when a fixture stops reaching the
 * code the matrix claims to price.
 */
describe("auth benchmark fixtures", () => {
  describe("the flag ladder", () => {
    it("every level resolves to a flag set the reactor accepts", () => {
      for (const level of AUTH_LEVELS) {
        expect(() => resolveFeatureFlags(flagsFor(level))).not.toThrow();
      }
    });

    it("is cumulative, so no cell skips a prerequisite", () => {
      for (const level of AUTH_LEVELS) {
        const flags = flagsFor(level);
        if (flags.authConditions) expect(flags.authGroups).toBe(true);
        if (flags.authGroups) expect(flags.authEnforcement).toBe(true);
        if (flags.authEnforcement) expect(flags.documentDecisions).toBe(true);
      }
    });

    it("separates the clean baseline from the policied one", () => {
      expect(policiedAt("L0_CLEAN")).toBe(false);
      expect(policiedAt("L0_POLICIED")).toBe(true);
      expect(flagsFor("L0_POLICIED")).toEqual(flagsFor("L0_CLEAN"));
    });
  });

  describe("generated policies are installable", () => {
    const shapes: Array<[string, PolicyShape]> = [
      ["minimal", MINIMAL_SHAPE],
      ["10 grants", shape({ grantCount: 10 })],
      ["at the grant cap", shape({ grantCount: MAX_AUTH_GRANTS })],
      ["match first", shape({ grantCount: 100, matchPosition: "first" })],
      ["with groups", shape({ grantCount: 10, groupIds: ["g-1", "g-2"] })],
      [
        "with conditions",
        shape({ grantCount: 10, where: conditionTree(2, MAX_CONDITION_NODES) }),
      ],
    ];

    it.each(shapes)("%s: every grant passes validation", (_name, s) => {
      for (const grant of buildGrants(s)) {
        expect(grantProblem(grant)).toBeNull();
      }
    });

    it.each(shapes)("%s: accepted with no creator", (_name, s) => {
      expect(() =>
        assertValidInitialGrants(buildGrants(s), DOC_TYPE, undefined),
      ).not.toThrow();
    });

    it.each(shapes)("%s: never exceeds the grant cap", (_name, s) => {
      expect(buildGrants(s).length).toBeLessThanOrEqual(MAX_AUTH_GRANTS);
    });

    it("hits the requested grant count exactly once past the fixed grants", () => {
      expect(buildGrants(shape({ grantCount: 100 })).length).toBe(100);
      expect(buildGrants(shape({ grantCount: 10 })).length).toBe(10);
    });

    it("installs an initialized policy, not the open fast path", () => {
      expect(buildAuthState(MINIMAL_SHAPE).version).toBe(1);
    });
  });

  describe("policies decide what the matrix assumes", () => {
    it("allows the writer on the domain scope", () => {
      const grants = buildGrants(shape({ grantCount: 100 }));
      const decision = evaluateGrantStack(
        grants,
        { address: BENCH_WRITER_ADDRESS, key: "bench" },
        EXECUTE_GLOBAL,
      );
      expect(decision.decision).toBe("allow");
    });

    it("denies an outsider, so the policy is actually gating", () => {
      const grants = buildGrants(shape({ grantCount: 100 }));
      const decision = evaluateGrantStack(
        grants,
        { address: BENCH_OUTSIDER_ADDRESS, key: "other" },
        EXECUTE_GLOBAL,
      );
      expect(decision.decision).toBe("deny");
    });

    it("allows the writer whether the deciding grant is scanned first or last", () => {
      for (const matchPosition of ["first", "last"] as const) {
        const grants = buildGrants(shape({ grantCount: 100, matchPosition }));
        expect(
          evaluateGrantStack(
            grants,
            { address: BENCH_WRITER_ADDRESS, key: "bench" },
            EXECUTE_GLOBAL,
          ).decision,
        ).toBe("allow");
      }
    });

    it("group principals match only when a groups map is supplied", () => {
      const grants = buildGrants(
        shape({ grantCount: 4, groupIds: ["g-1"], matchPosition: "last" }),
      );
      const member = { address: groupMembers(3, false)[0], key: "m" };
      const groups: AuthGroups = { "g-1": { members: groupMembers(3, false) } };

      expect(evaluateGrantStack(grants, member, EXECUTE_GLOBAL).decision).toBe(
        "deny",
      );
      expect(
        evaluateGrantStack(grants, member, EXECUTE_GLOBAL, groups).decision,
      ).toBe("allow");
    });

    it("conditional grants apply only when a condition context is supplied", () => {
      const where: Condition = {
        eq: [{ attr: "doc.global.name" }, { lit: "open" }],
      };
      const grants: Grant[] = [
        {
          id: "admin",
          description: "auth admin",
          effect: "allow" as const,
          principal: { anyone: true as const },
          capability: { can: "execute" as const, scope: "auth" },
        },
        {
          id: "conditional",
          description: "open only while named open",
          effect: "allow" as const,
          principal: { anyone: true as const },
          capability: { can: "execute" as const, scope: "global" },
          where,
        },
      ];
      const subject = { address: BENCH_WRITER_ADDRESS, key: "bench" };

      expect(evaluateGrantStack(grants, subject, EXECUTE_GLOBAL).decision).toBe(
        "deny",
      );
      expect(
        evaluateGrantStack(grants, subject, EXECUTE_GLOBAL, undefined, {
          scopeState: { name: "open" },
        }).decision,
      ).toBe("allow");
    });
  });

  describe("condition trees stay inside the language's limits", () => {
    it("a wide tree reaches the node cap without exceeding it", () => {
      const condition = conditionTree(2, MAX_CONDITION_NODES);
      expect(countConditionNodes(condition)).toBeLessThanOrEqual(
        MAX_CONDITION_NODES,
      );
      expect(countConditionNodes(condition)).toBeGreaterThan(
        MAX_CONDITION_NODES / 2,
      );
    });

    it("a deep tree reaches the depth cap and still validates", () => {
      const condition = conditionTree(MAX_CONDITION_DEPTH, MAX_CONDITION_NODES);
      const grant = {
        id: "deep",
        description: "deep condition",
        effect: "allow" as const,
        principal: { anyone: true as const },
        capability: { can: "execute" as const, scope: "global" },
        where: condition,
      };
      expect(grantProblem(grant)).toBeNull();
    });

    it("the fixture's node count agrees with the validator's budget", () => {
      const overBudget = conditionTree(2, MAX_CONDITION_NODES * 3);
      expect(countConditionNodes(overBudget)).toBeGreaterThan(
        MAX_CONDITION_NODES,
      );
      expect(
        grantProblem({
          id: "over",
          description: "over budget",
          effect: "allow",
          principal: { anyone: true },
          capability: { can: "execute", scope: "global" },
          where: overBudget,
        }),
      ).toMatch(/exceeds 100 nodes/);
    });
  });

  describe("the adversarial administration stack", () => {
    const grants = adversarialAdminGrants(MAX_AUTH_GRANTS);
    const ADMINISTER = {
      verb: "execute" as const,
      scope: "auth",
      operation: "SET_GRANT",
    };

    it("is installable, so it is a policy a deployment can hold", () => {
      expect(() =>
        assertValidInitialGrants(grants, DOC_TYPE, undefined),
      ).not.toThrow();
    });

    it("administers only through the final grant", () => {
      expect(
        evaluateGrantStack(
          grants,
          { address: BENCH_ADMIN_ADDRESS, key: undefined },
          ADMINISTER,
        ).decision,
      ).toBe("allow");
    });

    it("shadows every earlier candidate, so the search cannot stop early", () => {
      const candidates = grants.filter(
        (grant) =>
          grant.effect === "allow" &&
          "address" in grant.principal &&
          grant.principal.address !== BENCH_ADMIN_ADDRESS,
      );
      expect(candidates.length).toBeGreaterThan(90);

      for (const candidate of candidates) {
        const address = (candidate.principal as { address: string }).address;
        expect(
          evaluateGrantStack(grants, { address, key: undefined }, ADMINISTER)
            .decision,
        ).toBe("deny");
      }
    });

    it("still passes retention, so the cost is paid on a legal change", () => {
      expect(() =>
        assertAuthAdministrationRetained(
          undefined,
          grants,
          grants,
          "bench-sole-admin",
        ),
      ).not.toThrow();
    });
  });

  describe("group rosters", () => {
    it("includes the writer only when asked", () => {
      expect(groupMembers(5, false)).toHaveLength(5);
      expect(groupMembers(5, true)).toContain(BENCH_WRITER_ADDRESS);
    });
  });
});
