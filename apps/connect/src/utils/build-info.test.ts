import { afterEach, describe, expect, it } from "vitest";
import { getAppBuildId, getVersion } from "./build-info.js";

// No vite `define` for CONNECT_GIT_SHA is wired into vitest.config.ts (see
// vite.config.ts, which only does that for the real app build), so
// getGitSha() falls through to WORKSPACE_GIT_SHA in this suite — exactly the
// "env sha set" vs. "dev, no env" split getAppBuildId needs to distinguish.
describe("getAppBuildId", () => {
  const originalSha = process.env.WORKSPACE_GIT_SHA;

  afterEach(() => {
    if (originalSha === undefined) {
      delete process.env.WORKSPACE_GIT_SHA;
    } else {
      process.env.WORKSPACE_GIT_SHA = originalSha;
    }
  });

  it("returns the real git sha unchanged in production, ignoring any worker build digest", () => {
    process.env.WORKSPACE_GIT_SHA = "deadbeef1234";
    expect(getAppBuildId("some-dev-digest")).toBe("deadbeef1234");
    expect(getAppBuildId(null)).toBe("deadbeef1234");
    expect(getAppBuildId(undefined)).toBe("deadbeef1234");
  });

  it("falls back to the static version with no digest (dev, no worker bundle served yet)", () => {
    delete process.env.WORKSPACE_GIT_SHA;
    expect(getAppBuildId(null)).toBe(getVersion());
    expect(getAppBuildId(undefined)).toBe(getVersion());
    expect(getAppBuildId("")).toBe(getVersion());
  });

  it("folds a worker build digest into the dev fingerprint, so a rebuilt bundle changes it", () => {
    delete process.env.WORKSPACE_GIT_SHA;
    const a = getAppBuildId("digest-aaa");
    const b = getAppBuildId("digest-bbb");
    expect(a).not.toBe(b);
    expect(a).not.toBe(getVersion());
    expect(a).toContain(getVersion());
    expect(a).toContain("digest-aaa");
  });
});
