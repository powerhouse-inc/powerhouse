import { describe, expect, it } from "vitest";
import {
  DEFAULT_AUTHORING_MODE,
  parseDefinitionSourcesConfig,
} from "./definition-sources.js";

describe("DEFAULT_AUTHORING_MODE", () => {
  it("stays schema-first while code-first projects are experimental", () => {
    expect(DEFAULT_AUTHORING_MODE).toBe("schema-first");
  });
});

describe("parseDefinitionSourcesConfig", () => {
  it("reads a code-first selection and leaves its entries untouched", () => {
    const entries = [{ specifier: "./src/models.ts" }];
    expect(
      parseDefinitionSourcesConfig({
        formatVersion: 1,
        mode: "code-first",
        entries,
      }),
    ).toEqual({ ok: true, mode: "code-first", entries });
  });

  it("reads an explicit schema-first selection", () => {
    expect(
      parseDefinitionSourcesConfig({ formatVersion: 1, mode: "schema-first" }),
    ).toEqual({ ok: true, mode: "schema-first" });
  });

  it("distinguishes an absent field from an unsupported version", () => {
    expect(parseDefinitionSourcesConfig(undefined)).toMatchObject({
      ok: false,
      reason: "missing",
    });
    expect(
      parseDefinitionSourcesConfig({ formatVersion: 2, mode: "code-first" }),
    ).toMatchObject({
      ok: false,
      reason: "unsupported-version",
      received: 2,
    });
  });

  it("accepts an empty code-first list", () => {
    expect(
      parseDefinitionSourcesConfig({
        formatVersion: 1,
        mode: "code-first",
        entries: [],
      }),
    ).toEqual({ ok: true, mode: "code-first", entries: [] });
  });

  it("rejects entries under schema-first mode", () => {
    expect(
      parseDefinitionSourcesConfig({
        formatVersion: 1,
        mode: "schema-first",
        entries: [{ specifier: "./src/models.ts" }],
      }),
    ).toMatchObject({ ok: false, reason: "invalid", received: ["entries"] });
  });

  it("rejects an unknown mode and an unknown property", () => {
    expect(
      parseDefinitionSourcesConfig({ formatVersion: 1, mode: "auto" }),
    ).toMatchObject({ ok: false, reason: "invalid", received: "auto" });
    expect(
      parseDefinitionSourcesConfig({
        formatVersion: 1,
        mode: "code-first",
        entries: [{ specifier: "./src/models.ts" }],
        scan: true,
      }),
    ).toMatchObject({ ok: false, reason: "invalid", received: ["scan"] });
  });
});
