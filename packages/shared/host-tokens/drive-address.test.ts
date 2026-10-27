import { describe, expect, it } from "vitest";
import { driveAddressMessage, switchboardOfDrive } from "./drive-address.js";

describe("switchboardOfDrive", () => {
  it("splits a drive address into its switchboard and slug", () => {
    expect(switchboardOfDrive("http://localhost:4001/d/powerhouse")).toEqual({
      base: "http://localhost:4001",
      graphql: "http://localhost:4001/graphql",
      slug: "powerhouse",
    });
  });

  it("takes a drive on the switchboard the page origin proxies", () => {
    expect(switchboardOfDrive("${origin}/d/powerhouse")).toEqual({
      base: "${origin}",
      graphql: "${origin}/graphql",
      slug: "powerhouse",
    });
    expect(switchboardOfDrive("${origin}/graphql")).toBeUndefined();
    expect(
      switchboardOfDrive("${origin}//elsewhere.example/d/x"),
    ).toBeUndefined();
  });

  it("keeps a path prefix in the base", () => {
    expect(switchboardOfDrive("https://sb.example/api/v1/d/b")).toEqual({
      base: "https://sb.example/api/v1",
      graphql: "https://sb.example/api/v1/graphql",
      slug: "b",
    });
  });

  it("accepts a trailing slash and ignores query and hash", () => {
    expect(
      switchboardOfDrive("http://localhost:4001/d/powerhouse/?x=1#y"),
    ).toEqual({
      base: "http://localhost:4001",
      graphql: "http://localhost:4001/graphql",
      slug: "powerhouse",
    });
  });

  it.each([
    "http://localhost:4001/graphql",
    "http://localhost:4001",
    "http://localhost:4001/d/",
    "http://localhost:4001/d/a/b",
    "ftp://localhost/d/a",
    "not a url",
    "",
  ])("is undefined for %j", (url) => {
    expect(switchboardOfDrive(url)).toBeUndefined();
  });
});

describe("driveAddressMessage", () => {
  it("names the drive address that replaces a GraphQL url", () => {
    expect(driveAddressMessage("http://localhost:4001/graphql")).toBe(
      "http://localhost:4001/graphql is not a switchboard drive address (<switchboard>/d/<slug>): use http://localhost:4001/d/<slug>, one of the switchboard's drives.",
    );
  });

  it("names the proxied drive address that replaces ${origin}/graphql", () => {
    expect(driveAddressMessage("${origin}/graphql")).toBe(
      "${origin}/graphql is not a switchboard drive address (<switchboard>/d/<slug>): use ${origin}/d/<slug>, one of the switchboard's drives.",
    );
  });

  it("names the form for any other url", () => {
    expect(driveAddressMessage("http://x")).toBe(
      "http://x is not a switchboard drive address (<switchboard>/d/<slug>): use one of the switchboard's drives, e.g. http://localhost:4001/d/powerhouse.",
    );
  });
});
