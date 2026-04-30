import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { phConfigPlugin } from "./vite-plugins/ph-config.js";
import { runtimeConfigSchema } from "./runtime-config-schema.js";

type SchemaNode = Record<string, unknown> & {
  properties?: Record<string, SchemaNode>;
  items?: SchemaNode;
  oneOf?: SchemaNode[];
};

function findInSchema(schema: SchemaNode, key: string): SchemaNode | null {
  if (schema.properties?.[key]) return schema.properties[key];
  if (schema.oneOf) {
    for (const variant of schema.oneOf) {
      const found = findInSchema(variant, key);
      if (found) return found;
    }
  }
  return null;
}

// Walks an emitted config and asserts every key has a matching declaration in
// the schema. Catches drift: if the plugin emits a field the schema doesn't
// know about, this throws with the offending path.
function assertSchemaCovers(
  value: unknown,
  schema: SchemaNode,
  pathLabel: string,
): void {
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    const itemSchema = (schema.items ?? {}) as SchemaNode;
    for (const item of value) {
      assertSchemaCovers(item, itemSchema, `${pathLabel}[]`);
    }
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key === "$schema") continue;
    const childSchema = findInSchema(schema, key);
    if (!childSchema) {
      throw new Error(
        `runtime-config-schema: missing declaration for path '${pathLabel}.${key}'`,
      );
    }
    assertSchemaCovers(child, childSchema, `${pathLabel}.${key}`);
  }
}

describe("runtime-config schema", () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), "ph-schema-test-"));
    writeFileSync(
      join(projectRoot, "package.json"),
      JSON.stringify({ name: "drift-test", version: "1.0.0" }),
    );
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it("declares schemaVersion as const 2 (matches runtime CURRENT_SCHEMA_VERSION)", () => {
    const props = runtimeConfigSchema.properties as unknown as Record<
      string,
      SchemaNode
    >;
    expect(props.schemaVersion.const).toBe(2);
  });

  it("covers every field the plugin emits when fully loaded", () => {
    const plugin = phConfigPlugin({
      packages: [
        {
          packageName: "@scope/a",
          version: "1.0.0",
          provider: "registry",
          url: "https://example",
        },
        { packageName: "@scope/b", provider: "local" },
      ],
      projectRoot,
      connect: {
        branding: {
          appName: "Test",
          homeBackground: { avif: "/a.avif", png: "/a.png" },
        },
        drives: {
          allowAddDrive: false,
          defaultDrives: [
            { url: "https://drive.example", name: "Drive", icon: "/icon.png" },
            { url: "https://drive2.example", name: null, icon: null },
          ],
        },
      },
    });

    let emitted = "";
    const ctx = {
      emitFile(file: { type: string; fileName: string; source: string }) {
        if (file.fileName === "powerhouse.config.json") emitted = file.source;
      },
    };
    const generateBundle = plugin.generateBundle as (
      this: unknown,
      ...args: unknown[]
    ) => void;
    generateBundle.call(ctx);

    const config = JSON.parse(emitted) as Record<string, unknown>;
    expect(() =>
      assertSchemaCovers(
        config,
        runtimeConfigSchema as unknown as SchemaNode,
        "$",
      ),
    ).not.toThrow();
  });

  it("rejects an unknown field at the top level (regression: additionalProperties: false)", () => {
    const polluted = {
      schemaVersion: 2,
      packages: [],
      localPackage: null,
      connect: {},
      surpriseField: "should fail coverage",
    };
    expect(() =>
      assertSchemaCovers(
        polluted,
        runtimeConfigSchema as unknown as SchemaNode,
        "$",
      ),
    ).toThrow(/surpriseField/);
  });
});
