import { describe, expect, it } from "vitest";
import {
  ArgumentAliasError,
  optionalOneOf,
  requireOneOf,
} from "../src/graphql/argument-aliases.js";

function refusal(fn: () => unknown): ArgumentAliasError {
  try {
    fn();
  } catch (error) {
    if (error instanceof ArgumentAliasError) return error;
    throw error;
  }
  throw new Error("expected an ArgumentAliasError");
}

describe("requireOneOf", () => {
  it("returns the new name's value", () => {
    expect(requireOneOf({ idOrSlug: "a" }, "idOrSlug", "identifier")).toBe("a");
  });

  it("returns the deprecated name's value", () => {
    expect(requireOneOf({ identifier: "a" }, "idOrSlug", "identifier")).toBe(
      "a",
    );
  });

  it("treats null as not given", () => {
    expect(
      requireOneOf(
        { idOrSlug: null, identifier: "a" },
        "idOrSlug",
        "identifier",
      ),
    ).toBe("a");
  });

  it("counts an empty list as given", () => {
    expect(
      requireOneOf({ idsOrSlugs: [] }, "idsOrSlugs", "identifiers"),
    ).toEqual([]);
  });

  it("refuses both, even with the same value", () => {
    const error = refusal(() =>
      requireOneOf(
        { idOrSlug: "a", identifier: "a" },
        "idOrSlug",
        "identifier",
      ),
    );
    expect(error.extensions.code).toBe("BAD_USER_INPUT");
    expect(error.message).toBe("Pass idOrSlug or identifier, not both.");
  });

  it("refuses neither", () => {
    const error = refusal(() =>
      requireOneOf({ idOrSlug: null }, "idOrSlug", "identifier"),
    );
    expect(error.extensions.code).toBe("BAD_USER_INPUT");
    expect(error.message).toBe("idOrSlug is required.");
  });
});

describe("optionalOneOf", () => {
  it("returns either name's value", () => {
    expect(
      optionalOneOf(
        { parentIdOrSlug: "p" },
        "parentIdOrSlug",
        "parentIdentifier",
      ),
    ).toBe("p");
    expect(
      optionalOneOf(
        { parentIdentifier: "p" },
        "parentIdOrSlug",
        "parentIdentifier",
      ),
    ).toBe("p");
  });

  it("returns undefined for neither", () => {
    expect(
      optionalOneOf(
        { parentIdOrSlug: null },
        "parentIdOrSlug",
        "parentIdentifier",
      ),
    ).toBeUndefined();
  });

  it("refuses both", () => {
    const error = refusal(() =>
      optionalOneOf(
        { parentIdOrSlug: "p", parentIdentifier: "q" },
        "parentIdOrSlug",
        "parentIdentifier",
      ),
    );
    expect(error.extensions.code).toBe("BAD_USER_INPUT");
  });
});
