import { describe, expect, it } from "vitest";
import type { BlockFormProp } from "./forms.js";
import { lacksDefaults, withPropDefaults } from "./prop-defaults.js";

const props: BlockFormProp[] = [
  {
    name: "limit",
    displayName: "Limit",
    type: "NUMBER",
    required: true,
    defaultValue: 10,
  },
  {
    name: "format",
    displayName: "Format",
    type: "STATIC_DROPDOWN",
    required: false,
    defaultValue: "json",
  },
  { name: "query", displayName: "Query", type: "SHORT_TEXT", required: true },
  {
    name: "help",
    displayName: "Help",
    type: "MARKDOWN",
    required: false,
    defaultValue: "Read the docs",
  },
];

describe("withPropDefaults", () => {
  it("writes every unset default, required or not, but no markdown", () => {
    expect(withPropDefaults(props, {})).toEqual({ limit: 10, format: "json" });
  });

  it("keeps values already set, falsy ones included", () => {
    expect(withPropDefaults(props, { limit: 0, format: "" })).toEqual({
      limit: 0,
      format: "",
    });
  });

  it("does not mutate the config it is given", () => {
    const config = { query: "q" };
    withPropDefaults(props, config);
    expect(config).toEqual({ query: "q" });
  });

  it("treats a non-object config as empty", () => {
    expect(withPropDefaults(props, "nope")).toEqual({
      limit: 10,
      format: "json",
    });
  });
});

describe("lacksDefaults", () => {
  it("is true only while some default is still unwritten", () => {
    expect(lacksDefaults(props, {})).toBe(true);
    expect(lacksDefaults(props, withPropDefaults(props, {}))).toBe(false);
    expect(lacksDefaults([props[2], props[3]], {})).toBe(false);
  });
});
