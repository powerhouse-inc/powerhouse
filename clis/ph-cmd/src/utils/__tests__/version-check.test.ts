import { describe, expect, it } from "vitest";
import { getStream, isOutdated } from "../version-check.js";

describe("getStream", () => {
  it("returns latest for stable versions", () => {
    expect(getStream("6.2.2")).toBe("latest");
    expect(getStream("1.0.0")).toBe("latest");
  });

  it("returns dev for any prerelease version (dev, staging, rc, ...)", () => {
    expect(getStream("6.2.3-dev.0")).toBe("dev");
    expect(getStream("6.2.2-dev.87")).toBe("dev");
    expect(getStream("6.2.2-staging.0")).toBe("dev");
    expect(getStream("6.2.0-rc.8")).toBe("dev");
  });

  it("falls back to latest for unparseable versions (never nag with a dev target)", () => {
    expect(getStream("unknown")).toBe("latest");
    expect(getStream("")).toBe("latest");
    expect(getStream("not-a-version")).toBe("latest");
  });
});

describe("isOutdated", () => {
  it("is true when the stream target is newer", () => {
    expect(isOutdated("6.2.2", "6.2.3")).toBe(true);
    expect(isOutdated("6.2.2", "6.3.0")).toBe(true);
  });

  it("is false when the versions are equal", () => {
    expect(isOutdated("6.2.2", "6.2.2")).toBe(false);
  });

  it("is false when the stream target is older (no downgrades)", () => {
    expect(isOutdated("6.3.0", "6.2.2")).toBe(false);
  });

  it("nags a dev build toward its own release (dev build sorts below it)", () => {
    expect(isOutdated("6.2.2-dev.87", "6.2.2")).toBe(true);
  });

  it("compares dev builds within the dev stream", () => {
    expect(isOutdated("6.2.3-dev.2", "6.2.3-dev.5")).toBe(true);
    expect(isOutdated("6.2.3-dev.5", "6.2.3-dev.2")).toBe(false);
  });

  it("is false when either side is unparseable (never nag on broken data)", () => {
    expect(isOutdated("unknown", "6.2.3")).toBe(false);
    expect(isOutdated("6.2.2", "broken")).toBe(false);
  });
});
