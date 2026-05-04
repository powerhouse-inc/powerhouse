import { describe, expect, it } from "vitest";
import { LOG_LEVELS } from "./constants.js";
import { sourceConfigSchema } from "./source-config-schema.js";

// Drift guard: ensures the JSON Schema in source-config-schema.ts stays in
// sync with the PowerhouseConfig TS type in types.ts. Whenever someone adds,
// renames, or removes a field on PowerhouseConfig, this test forces a
// matching schema update — otherwise editor tooltips lie.
//
// Strategy: hardcode the expected top-level field set + their required-vs-
// optional split + the enums/structures we care about, and assert against
// the schema. The expected lists are derived by reading types.ts; updating
// types.ts forces updating both this test and the schema, surfacing drift.

// No field is strictly required on disk — the CLI merges DEFAULT_CONFIG
// (constants.ts) into whatever the file contains. Schema describes what
// fields are *recognised*, not what must be present.
const EXPECTED_PROPERTIES = [
  "$schema",
  "logLevel",
  "documentModelsDir",
  "editorsDir",
  "processorsDir",
  "subgraphsDir",
  "importScriptsDir",
  "skipFormat",
  "interactive",
  "watch",
  "reactor",
  "auth",
  "switchboard",
  "studio",
  "packages",
  "vetra",
  "packageRegistryUrl",
  "connect",
] as const;

describe("source-config schema", () => {
  it("declares no top-level required fields (CLI merges DEFAULT_CONFIG)", () => {
    expect(
      (sourceConfigSchema as { required?: readonly string[] }).required,
    ).toBeUndefined();
  });

  it("declares the full set of properties PowerhouseConfig recognises", () => {
    const schemaProps = Object.keys(sourceConfigSchema.properties).sort();
    expect(schemaProps).toEqual([...EXPECTED_PROPERTIES].sort());
  });

  it("rejects unknown top-level fields (additionalProperties: false)", () => {
    expect(sourceConfigSchema.additionalProperties).toBe(false);
  });

  it("logLevel enum stays in sync with the LOG_LEVELS constant", () => {
    const props = sourceConfigSchema.properties as unknown as Record<
      string,
      { enum?: readonly string[] }
    >;
    expect(props.logLevel.enum).toEqual([...LOG_LEVELS]);
  });

  it("packages references the shared PowerhousePackage shape (has packageName)", () => {
    const props = sourceConfigSchema.properties as unknown as Record<
      string,
      { items?: { properties?: Record<string, unknown> } }
    >;
    expect(props.packages.items?.properties).toHaveProperty("packageName");
  });

  it("connect references the shared PHConnectRuntimeConfig shape (has branding + drives)", () => {
    const props = sourceConfigSchema.properties as unknown as Record<
      string,
      { properties?: Record<string, unknown> }
    >;
    expect(props.connect.properties).toHaveProperty("branding");
    expect(props.connect.properties).toHaveProperty("drives");
  });

  it("reactor.https accepts boolean OR keyPath/certPath object", () => {
    const props = sourceConfigSchema.properties as unknown as Record<
      string,
      {
        properties?: Record<
          string,
          { oneOf?: Array<{ type?: string; required?: readonly string[] }> }
        >;
      }
    >;
    const variants = props.reactor.properties?.https.oneOf ?? [];
    expect(variants.find((v) => v.type === "boolean")).toBeDefined();
    expect(
      variants.find((v) => v.required && v.required.includes("keyPath")),
    ).toBeDefined();
  });

  it("reactor.storage.type enum covers all four backends", () => {
    const props = sourceConfigSchema.properties as unknown as Record<
      string,
      {
        properties?: Record<
          string,
          { properties?: Record<string, { enum?: readonly string[] }> }
        >;
      }
    >;
    expect(props.reactor.properties?.storage.properties?.type.enum).toEqual([
      "filesystem",
      "memory",
      "postgres",
      "browser",
    ]);
  });
});
