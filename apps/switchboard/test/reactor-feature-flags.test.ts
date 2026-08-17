import { describe, expect, it } from "vitest";
import { resolveReactorFeatureFlags } from "../src/reactor-feature-flags.mjs";

describe("resolveReactorFeatureFlags", () => {
  it("reports every flag off for an empty environment", () => {
    const { flags, enabled } = resolveReactorFeatureFlags({});

    expect(flags).toEqual({
      documentDecisions: false,
      authEnforcement: false,
      authGroups: false,
      authConditions: false,
    });
    expect(enabled).toEqual([]);
  });

  it("only accepts the literal true", () => {
    const { enabled } = resolveReactorFeatureFlags({
      REACTOR_DOCUMENT_DECISIONS: "1",
      REACTOR_AUTH_ENFORCEMENT: "yes",
      REACTOR_AUTH_GROUPS: "TRUE",
      REACTOR_AUTH_CONDITIONS: "",
    });

    expect(enabled).toEqual([]);
  });

  it("reads all four flags, in prerequisite order", () => {
    const { flags, enabled } = resolveReactorFeatureFlags({
      REACTOR_DOCUMENT_DECISIONS: "true",
      REACTOR_AUTH_ENFORCEMENT: "true",
      REACTOR_AUTH_GROUPS: "true",
      REACTOR_AUTH_CONDITIONS: "true",
    });

    expect(flags).toEqual({
      documentDecisions: true,
      authEnforcement: true,
      authGroups: true,
      authConditions: true,
    });
    expect(enabled).toEqual([
      "documentDecisions",
      "authEnforcement",
      "authGroups",
      "authConditions",
    ]);
  });

  it("passes an inconsistent set through for the reactor to reject", () => {
    // Correcting it here would enforce something other than what was asked for;
    // the builder throws on the missing prerequisite at boot instead.
    const { flags, enabled } = resolveReactorFeatureFlags({
      REACTOR_AUTH_ENFORCEMENT: "true",
    });

    expect(flags.authEnforcement).toBe(true);
    expect(flags.documentDecisions).toBe(false);
    expect(enabled).toEqual(["authEnforcement"]);
  });
});
