import { afterEach, describe, expect, it } from "vitest";
import { getAppBuildId, getVersion } from "./build-info.js";

// No vite `define` for CONNECT_GIT_SHA is wired into vitest.config.ts (see
// vite.config.ts, which only does that for the real app build), so
// getGitSha() falls through to WORKSPACE_GIT_SHA in this suite — exactly the
// "env sha set" vs. "dev, no env" split these helpers need to distinguish.
describe("getAppBuildId", () => {
  const originalSha = process.env.WORKSPACE_GIT_SHA;

  afterEach(() => {
    if (originalSha === undefined) {
      delete process.env.WORKSPACE_GIT_SHA;
    } else {
      process.env.WORKSPACE_GIT_SHA = originalSha;
    }
  });

  it("returns the real git sha unchanged in production", () => {
    process.env.WORKSPACE_GIT_SHA = "deadbeef1234";
    expect(getAppBuildId()).toBe("deadbeef1234");
  });

  it("falls back to the static version in dev", () => {
    delete process.env.WORKSPACE_GIT_SHA;
    expect(getAppBuildId()).toBe(getVersion());
  });

  /**
   * The worker bundle's content token is NOT folded in here: it travels as the
   * fingerprint's own `buildDigest` field, because a tab of the identical build
   * can fail to resolve it and an absent token must read as unknown rather than
   * as a different build.
   */
  it("carries no worker build digest of its own", () => {
    delete process.env.WORKSPACE_GIT_SHA;
    expect(getAppBuildId()).not.toContain("+");
  });
});
