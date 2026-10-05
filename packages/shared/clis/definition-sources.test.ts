import { describe, expect, it } from "vitest";
import {
  parseDefinitionSourceOption,
  parseDefinitionSourcesConfig,
} from "./definition-sources.js";

describe("parseDefinitionSourceOption", () => {
  it("selects the namespace root when the fragment is absent", () => {
    expect(parseDefinitionSourceOption("./src/models.ts")).toEqual({
      ok: true,
      source: { specifier: "./src/models.ts" },
    });
  });

  it("selects the namespace root for an empty pointer", () => {
    expect(parseDefinitionSourceOption("./src/models.ts#")).toEqual({
      ok: true,
      source: { specifier: "./src/models.ts" },
    });
  });

  it("reads a one-segment pointer", () => {
    expect(
      parseDefinitionSourceOption("./src/models.ts#/invoiceFamily"),
    ).toEqual({
      ok: true,
      source: { specifier: "./src/models.ts", exportPath: ["invoiceFamily"] },
    });
  });

  it("reads a nested pointer", () => {
    expect(
      parseDefinitionSourceOption("./src/models.ts#/models/invoice"),
    ).toEqual({
      ok: true,
      source: {
        specifier: "./src/models.ts",
        exportPath: ["models", "invoice"],
      },
    });
  });

  it("decodes ~0 as ~ and ~1 as / inside one property key", () => {
    expect(parseDefinitionSourceOption("./src/models.ts#/a~1b")).toEqual({
      ok: true,
      source: { specifier: "./src/models.ts", exportPath: ["a/b"] },
    });
    expect(parseDefinitionSourceOption("./src/models.ts#/a~0b")).toEqual({
      ok: true,
      source: { specifier: "./src/models.ts", exportPath: ["a~b"] },
    });
    expect(parseDefinitionSourceOption("./src/models.ts#/a~01b")).toEqual({
      ok: true,
      source: { specifier: "./src/models.ts", exportPath: ["a~1b"] },
    });
  });

  it("percent-decodes the fragment exactly once", () => {
    expect(parseDefinitionSourceOption("./src/models.ts#/a%20b")).toEqual({
      ok: true,
      source: { specifier: "./src/models.ts", exportPath: ["a b"] },
    });
    expect(parseDefinitionSourceOption("./src/models.ts#/a%2520b")).toEqual({
      ok: true,
      source: { specifier: "./src/models.ts", exportPath: ["a%20b"] },
    });
  });

  it("rejects a pointer with no leading slash", () => {
    expect(
      parseDefinitionSourceOption("./src/models.ts#invoiceFamily"),
    ).toMatchObject({ ok: false, reason: "pointer-prefix" });
  });

  it("rejects a malformed percent escape rather than selecting another export", () => {
    expect(parseDefinitionSourceOption("./src/models.ts#/a%2")).toMatchObject({
      ok: false,
      reason: "percent-escape",
    });
  });

  it("rejects a ~ that introduces neither ~0 nor ~1", () => {
    expect(parseDefinitionSourceOption("./src/models.ts#/a~2b")).toMatchObject({
      ok: false,
      reason: "tilde-escape",
    });
    expect(parseDefinitionSourceOption("./src/models.ts#/ab~")).toMatchObject({
      ok: false,
      reason: "tilde-escape",
    });
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

  it("rejects an empty code-first list rather than checking nothing", () => {
    expect(
      parseDefinitionSourcesConfig({
        formatVersion: 1,
        mode: "code-first",
        entries: [],
      }),
    ).toMatchObject({ ok: false, reason: "empty" });
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
