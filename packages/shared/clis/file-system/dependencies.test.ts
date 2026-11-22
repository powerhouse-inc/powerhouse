import { describe, expect, it } from "vitest";
import { getTagFromVersion, parseTag } from "./dependencies.js";

describe("getTagFromVersion", () => {
  it.each([
    ["6.3.0-dev.8", "dev"],
    ["^6.3.0-dev.8", "dev"],
    ["6.2.3-staging.0", "staging"],
    ["6.2.0-rc.8", "rc"],
    ["6.4.0-next.0", "next"],
    ["^6.4.0-next.3", "next"],
    ["6.2.3", "latest"],
    ["~6.2.3", "latest"],
  ])("reads %s as the %s tag", (version, tag) => {
    expect(getTagFromVersion(version)).toBe(tag);
  });
});

describe("parseTag", () => {
  it("maps each release flag to its tag", () => {
    expect(parseTag({ dev: true })).toBe("dev");
    expect(parseTag({ staging: true })).toBe("staging");
    expect(parseTag({ rc: true })).toBe("rc");
    expect(parseTag({ next: true })).toBe("next");
  });

  it("takes a tag given by name", () => {
    expect(parseTag({ tag: "next" })).toBe("next");
  });

  it("falls back to latest", () => {
    expect(parseTag({})).toBe("latest");
  });
});
