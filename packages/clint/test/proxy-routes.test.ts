import { describe, it, expect } from "vitest";
import {
  deriveBasePath,
  normalizeLoopbackHost,
  prefixMatches,
} from "../src/core/proxy-routes.js";

describe("prefixMatches", () => {
  it("matches on segment boundaries, not bare startsWith", () => {
    expect(prefixMatches("/foo", "/foo")).toBe(true);
    expect(prefixMatches("/foo", "/foo/x")).toBe(true);
    expect(prefixMatches("/foo", "/foobar")).toBe(false);
    expect(prefixMatches("/d", "/d/drive-123")).toBe(true);
    expect(prefixMatches("/d", "/drive-export")).toBe(false);
  });

  it("root prefix matches everything", () => {
    expect(prefixMatches("/", "/")).toBe(true);
    expect(prefixMatches("/", "/anything/here")).toBe(true);
  });

  it("trailing-slash prefix matches the bare prefix and any continuation", () => {
    expect(
      prefixMatches("/switchboard/attachments/", "/switchboard/attachments"),
    ).toBe(true);
    expect(
      prefixMatches(
        "/switchboard/attachments/",
        "/switchboard/attachments/abc",
      ),
    ).toBe(true);
    expect(
      prefixMatches("/switchboard/attachments/", "/switchboard/attachmentsX"),
    ).toBe(false);
  });
});

describe("normalizeLoopbackHost", () => {
  it("rewrites localhost to 127.0.0.1, preserving the port", () => {
    expect(normalizeLoopbackHost("localhost")).toBe("127.0.0.1");
    expect(normalizeLoopbackHost("localhost:4001")).toBe("127.0.0.1:4001");
    expect(normalizeLoopbackHost("LOCALHOST:8080")).toBe("127.0.0.1:8080");
  });

  it("leaves non-loopback and already-numeric hosts untouched", () => {
    expect(normalizeLoopbackHost("127.0.0.1:3001")).toBe("127.0.0.1:3001");
    expect(normalizeLoopbackHost("example.com:443")).toBe("example.com:443");
    expect(normalizeLoopbackHost("upstream.internal")).toBe(
      "upstream.internal",
    );
  });
});

describe("deriveBasePath", () => {
  it("returns empty for a scheme-less value", () => {
    expect(deriveBasePath("localhost:8090")).toBe("");
  });

  it("returns empty for an origin-only URL", () => {
    expect(deriveBasePath("http://localhost:8090")).toBe("");
  });

  it("derives the base path from a subpath, trailing slashes stripped", () => {
    expect(deriveBasePath("https://example.com/sub")).toBe("/sub");
    expect(deriveBasePath("https://example.com/sub///")).toBe("/sub");
  });

  it("treats a garbage string, undefined and whitespace as unset", () => {
    expect(deriveBasePath("not a url")).toBe("");
    expect(deriveBasePath(undefined)).toBe("");
    expect(deriveBasePath("   ")).toBe("");
  });
});
