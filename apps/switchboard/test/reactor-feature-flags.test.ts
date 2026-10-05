import { describe, expect, it } from "vitest";
import { resolveReactorFeatureFlags } from "../src/reactor-feature-flags.mjs";

describe("resolveReactorFeatureFlags", () => {
  it("reports only undoV3 on for an empty environment", () => {
    const { flags, enabled } = resolveReactorFeatureFlags({});

    expect(flags).toEqual({
      documentDecisions: false,
      authEnforcement: false,
      authGroups: false,
      authConditions: false,
      undoV3: true,
    });
    expect(enabled).toEqual(["undoV3"]);
  });

  it("only accepts the literal true for the enforcement flags", () => {
    const { enabled } = resolveReactorFeatureFlags({
      REACTOR_DOCUMENT_DECISIONS: "1",
      REACTOR_AUTH_ENFORCEMENT: "yes",
      REACTOR_AUTH_GROUPS: "TRUE",
      REACTOR_AUTH_CONDITIONS: "",
    });

    expect(enabled).toEqual(["undoV3"]);
  });

  it("turns undoV3 off only at the literal false", () => {
    expect(
      resolveReactorFeatureFlags({ REACTOR_UNDO_V3: "false" }).flags.undoV3,
    ).toBe(false);
    expect(
      resolveReactorFeatureFlags({ REACTOR_UNDO_V3: "FALSE" }).flags.undoV3,
    ).toBe(true);
  });

  it("reads every flag, enforcement flags in prerequisite order", () => {
    const { flags, enabled } = resolveReactorFeatureFlags({
      REACTOR_DOCUMENT_DECISIONS: "true",
      REACTOR_AUTH_ENFORCEMENT: "true",
      REACTOR_AUTH_GROUPS: "true",
      REACTOR_AUTH_CONDITIONS: "true",
      REACTOR_UNDO_V3: "true",
    });

    expect(flags).toEqual({
      documentDecisions: true,
      authEnforcement: true,
      authGroups: true,
      authConditions: true,
      undoV3: true,
    });
    expect(enabled).toEqual([
      "documentDecisions",
      "authEnforcement",
      "authGroups",
      "authConditions",
      "undoV3",
    ]);
  });

  it("passes an inconsistent set through for the reactor to reject", () => {
    // Correcting it here would enforce something other than what was asked for;
    // the builder throws on the missing prerequisite at boot instead.
    const { flags, enabled } = resolveReactorFeatureFlags({
      REACTOR_AUTH_ENFORCEMENT: "true",
      REACTOR_UNDO_V3: "false",
    });

    expect(flags.authEnforcement).toBe(true);
    expect(flags.documentDecisions).toBe(false);
    expect(enabled).toEqual(["authEnforcement"]);
  });
});
