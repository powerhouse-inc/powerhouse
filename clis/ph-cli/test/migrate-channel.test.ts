import { describe, expect, it } from "vitest";
import { inferReleaseTag, isOlderRelease } from "../src/services/migrate.js";

describe("ph migrate with no version", () => {
  it("stays on the dev channel of a project on a dev release", () => {
    expect(
      inferReleaseTag({
        devDependencies: {
          "@powerhousedao/ph-cli": "6.2.3-dev.73",
          vitest: "4.0.0",
        },
        peerDependencies: { "document-model": "^6.2.3-dev.73" },
      }),
    ).toEqual({
      tag: "dev",
      reason: "the project is on @powerhousedao/ph-cli@6.2.3-dev.73",
    });
  });

  it("stays on the staging channel", () => {
    expect(
      inferReleaseTag({
        devDependencies: { "@powerhousedao/ph-cli": "6.2.3-staging.4" },
      }).tag,
    ).toBe("staging");
  });

  it("follows latest on a stable release", () => {
    const { tag, reason } = inferReleaseTag({
      devDependencies: { "@powerhousedao/ph-cli": "6.2.3" },
    });
    expect(tag).toBe("latest");
    expect(reason).toContain("a stable release");
  });

  it("reads the newest Powerhouse version and ignores other packages", () => {
    expect(
      inferReleaseTag({
        dependencies: { react: "19.3.0-canary.1" },
        devDependencies: {
          "@powerhousedao/ph-cli": "6.2.2",
          "@powerhousedao/codegen": "workspace:*",
        },
        peerDependencies: { "document-model": "6.2.3-dev.12" },
      }),
    ).toEqual({
      tag: "dev",
      reason: "the project is on document-model@6.2.3-dev.12",
    });
  });

  it("follows latest when no Powerhouse version is pinned", () => {
    expect(inferReleaseTag({}).tag).toBe("latest");
    expect(
      inferReleaseTag({
        devDependencies: { "@powerhousedao/ph-cli": "catalog:" },
      }).tag,
    ).toBe("latest");
  });
});

describe("the older-release warning", () => {
  // 6.2.3 ranks above its dev releases but was published before dev.49.
  const publishTimes = {
    "6.2.3": "2026-09-30T10:00:00.000Z",
    "6.2.3-dev.49": "2026-10-08T10:00:00.000Z",
  };

  it("catches a stable release published before the installed dev release", () => {
    expect(isOlderRelease("6.2.3-dev.49", "6.2.3", publishTimes)).toBe(true);
  });

  it("catches a lower version without publish times", () => {
    expect(isOlderRelease("6.2.3-dev.73", "6.2.3-dev.70")).toBe(true);
    expect(isOlderRelease("6.2.3-dev.49", "6.2.3")).toBe(false);
  });

  it("lets a newer release through", () => {
    expect(isOlderRelease("6.2.3", "6.2.4", publishTimes)).toBe(false);
    expect(isOlderRelease("6.2.3-dev.49", "6.2.3-dev.73", publishTimes)).toBe(
      false,
    );
  });
});
