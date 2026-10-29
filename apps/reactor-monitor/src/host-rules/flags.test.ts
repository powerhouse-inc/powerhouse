import type { ReactorFeatureFlags } from "@powerhousedao/reactor";
import { describe, expect, it } from "vitest";
import {
  effectiveFlags,
  flagClosure,
  flagDependents,
  ladderFlags,
  ladderGaps,
  ladderLevel,
  LADDER,
  type FeatureFlag,
} from "./flags.js";

// The names match reactor's flags; reactor does not export its prerequisite table.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const sameFlags: Same<FeatureFlag, keyof ReactorFeatureFlags> = true;
void sameFlags;

describe("flags", () => {
  it("climbs the ladder cumulatively", () => {
    expect(
      [0, 1, 2, 3, 4].map((level) => ladderLevel(ladderFlags(level))),
    ).toEqual([0, 1, 2, 3, 4]);
    expect(ladderFlags(2)).toEqual({
      documentDecisions: true,
      authEnforcement: true,
      authGroups: false,
      authConditions: false,
    });
    for (const level of [0, 1, 2, 3, 4])
      expect(ladderGaps(ladderFlags(level))).toEqual([]);
  });

  it("closes over prerequisites and finds dependents", () => {
    expect(flagClosure("authGroups")).toEqual([
      "documentDecisions",
      "authEnforcement",
      "authGroups",
    ]);
    expect(flagClosure("documentDecisions")).toEqual(["documentDecisions"]);
    expect(flagDependents("authEnforcement")).toEqual([
      "authGroups",
      "authConditions",
    ]);
    expect(flagDependents("authConditions")).toEqual([]);
  });

  it.each<
    [Partial<Record<FeatureFlag, boolean>>, [FeatureFlag, FeatureFlag[]][]]
  >([
    [{ authEnforcement: true }, [["authEnforcement", ["documentDecisions"]]]],
    [
      { documentDecisions: true, authGroups: true },
      [["authGroups", ["authEnforcement"]]],
    ],
    [
      { authEnforcement: true, authConditions: true },
      [
        ["authEnforcement", ["documentDecisions"]],
        ["authConditions", ["authGroups"]],
      ],
    ],
  ])("finds the gaps in %j", (on, gaps) => {
    const flags = { ...ladderFlags(0), ...on };
    expect(ladderGaps(flags).map((gap) => [gap.flag, gap.missing])).toEqual(
      gaps,
    );
  });

  it("lets env win over the protocol, and reads only 'true' as on", () => {
    const protocol = { featureFlags: ladderFlags(2) };
    expect(effectiveFlags(protocol)).toEqual({
      flags: ladderFlags(2),
      fromEnv: {},
    });
    const { flags, fromEnv } = effectiveFlags(protocol, {
      REACTOR_AUTH_ENFORCEMENT: "1",
      REACTOR_AUTH_GROUPS: "true",
    });
    expect(flags).toEqual({ ...ladderFlags(1), authGroups: true });
    expect(fromEnv).toEqual({
      authEnforcement: "REACTOR_AUTH_ENFORCEMENT",
      authGroups: "REACTOR_AUTH_GROUPS",
    });
    expect(effectiveFlags(undefined).flags).toEqual(ladderFlags(0));
  });

  it("leaves undoV3 off the ladder", () => {
    expect(effectiveFlags({ featureFlags: { undoV3: true } }).flags).toEqual(
      ladderFlags(0),
    );
  });

  it("keeps the ladder in prerequisite order", () => {
    LADDER.forEach((flag, index) => {
      expect(flagClosure(flag)).toEqual(LADDER.slice(0, index + 1));
    });
  });
});
