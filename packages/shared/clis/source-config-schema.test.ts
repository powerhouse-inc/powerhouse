import { readFileSync } from "node:fs";
import { describe, expect, expectTypeOf, it } from "vitest";
import { LOG_LEVELS } from "./constants.js";
import { sourceConfigSchema } from "./source-config-schema.js";
import type { PowerhouseConfig } from "./types.js";

// Drift guard: ensures the JSON Schema in source-config-schema.ts stays in
// sync with the PowerhouseConfig TS type in types.ts. Whenever someone adds,
// renames, or removes a field on PowerhouseConfig, this test forces a
// matching schema update — otherwise editor tooltips lie.
//
// Strategy: hardcode the expected top-level field set, bind that set to the
// TypeScript keys with an exact compile-time assertion, and assert the same
// set plus selected structures against both schema representations.

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
  "definitionSources",
] as const;

describe("source-config schema", () => {
  it("declares no top-level required fields (CLI merges DEFAULT_CONFIG)", () => {
    expect(
      (sourceConfigSchema as { required?: readonly string[] }).required,
    ).toBeUndefined();
  });

  it("declares the full set of properties PowerhouseConfig recognises", () => {
    expectTypeOf<(typeof EXPECTED_PROPERTIES)[number]>().toEqualTypeOf<
      keyof PowerhouseConfig | "$schema"
    >();
    const schemaProps = Object.keys(sourceConfigSchema.properties).sort();
    expect(schemaProps).toEqual([...EXPECTED_PROPERTIES].sort());
  });

  it("matches the committed JSON Schema artifact", () => {
    const artifact = JSON.parse(
      readFileSync(
        new URL("./source-config.schema.json", import.meta.url),
        "utf8",
      ),
    ) as unknown;

    expect(artifact).toEqual(sourceConfigSchema);
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

  it("connect references the shared PHConnectRuntimeConfig shape (covers every documented section)", () => {
    const props = sourceConfigSchema.properties as unknown as Record<
      string,
      { properties?: Record<string, unknown> }
    >;
    expect(props.connect.properties).toHaveProperty("branding");
    expect(props.connect.properties).toHaveProperty("app");
    expect(props.connect.properties).toHaveProperty("packages");
    expect(props.connect.properties).toHaveProperty("drives");
    expect(props.connect.properties).toHaveProperty("renown");
    expect(props.connect.properties).toHaveProperty("sentry");
  });

  it("connect.drives.sections collapses public+cloud into a single 'remote'", () => {
    const props = sourceConfigSchema.properties as unknown as Record<
      string,
      {
        properties?: Record<
          string,
          {
            properties?: Record<
              string,
              { properties?: Record<string, unknown> }
            >;
          }
        >;
      }
    >;
    const sections = props.connect.properties?.drives.properties?.sections;
    expect(sections?.properties).toHaveProperty("remote");
    expect(sections?.properties).toHaveProperty("local");
    expect(sections?.properties).not.toHaveProperty("public");
    expect(sections?.properties).not.toHaveProperty("cloud");
  });

  it("connect schema uses affirmative naming only (no `disable*` fields)", () => {
    // Recursively collect every property name under `connect.*` and reject
    // any that starts with `disable`. Catches regressions where the legacy
    // `disable*` field shape leaks back into the JSON schema.
    const collected: string[] = [];
    function walk(node: unknown): void {
      if (!node || typeof node !== "object") return;
      const obj = node as Record<string, unknown>;
      if (obj.properties && typeof obj.properties === "object") {
        for (const [key, child] of Object.entries(
          obj.properties as Record<string, unknown>,
        )) {
          collected.push(key);
          walk(child);
        }
      }
      if (obj.items) walk(obj.items);
      if (Array.isArray(obj.oneOf)) for (const v of obj.oneOf) walk(v);
    }
    const props = sourceConfigSchema.properties as unknown as Record<
      string,
      unknown
    >;
    walk(props.connect);
    const offenders = collected.filter((k) => /^disable/i.test(k));
    expect(offenders).toEqual([]);
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

  it("definitionSources is a closed code-first or legacy union", () => {
    const props = sourceConfigSchema.properties as unknown as Record<
      string,
      {
        oneOf?: Array<{
          additionalProperties?: boolean;
          required?: readonly string[];
          properties?: Record<string, { const?: string | number }>;
        }>;
      }
    >;
    const variants = props.definitionSources.oneOf ?? [];
    const codeFirst = variants.find(
      (variant) => variant.properties?.mode.const === "code-first",
    );
    const legacy = variants.find(
      (variant) => variant.properties?.mode.const === "legacy",
    );

    expect(codeFirst?.additionalProperties).toBe(false);
    expect(codeFirst?.required).toEqual(["formatVersion", "mode", "entries"]);
    expect(legacy?.additionalProperties).toBe(false);
    expect(legacy?.required).toEqual(["formatVersion", "mode"]);
    expect(legacy?.properties).not.toHaveProperty("entries");
  });
});
