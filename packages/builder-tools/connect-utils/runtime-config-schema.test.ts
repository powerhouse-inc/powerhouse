import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_CONNECT_CONFIG } from "@powerhousedao/shared/connect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PhConfigPluginOptions } from "./vite-plugins/ph-config.js";
import { phConfigPlugin } from "./vite-plugins/ph-config.js";
import { runtimeConfigSchema } from "./runtime-config-schema.js";

function emitPluginOutput(
  options: PhConfigPluginOptions,
): Record<string, unknown> {
  const plugin = phConfigPlugin(options);
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
  return JSON.parse(emitted) as Record<string, unknown>;
}

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
    const config = emitPluginOutput({
      packages: [
        {
          packageName: "@scope/a",
          version: "1.0.0",
          provider: "registry",
          url: "https://example",
        },
        { packageName: "@scope/b", provider: "local" },
      ],
      packageRegistryUrl: "https://registry.example/-/cdn/",
      projectRoot,
      connect: {
        branding: {
          appName: "Test",
          homeBackground: { avif: "/a.avif", png: "/a.png" },
        },
        app: {
          logLevel: "debug",
          basePath: "/connect/",
        },
        packages: {
          externalEnabled: false,
        },
        drives: {
          allowAddDrive: false,
          defaultDrives: [
            { url: "https://drive.example", name: "Drive", icon: "/icon.png" },
            { url: "https://drive2.example", name: null, icon: null },
          ],
          preserveStrategy: "preserve-all",
          sections: {
            remote: { enabled: true, allowAdd: false, allowDelete: false },
            local: { enabled: false, allowAdd: false, allowDelete: false },
          },
        },
        renown: {
          url: "https://renown.example",
          networkId: "eip155",
          chainId: 1,
        },
      },
    });

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

  // Task 6: the emitter must populate every connect.* leaf with its default
  // so the dist file is fully self-describing. The "all defaults populated"
  // property is the guarantee task 8 relies on when it rewrites Connect to
  // read fields directly from the JSON without fallback guards.
  it("populates every DEFAULT_CONNECT_CONFIG field when source has no connect block (task 6)", () => {
    const config = emitPluginOutput({
      packages: [],
      projectRoot,
      // No `connect` key → empty source override
    });

    expect(config.connect).toEqual(DEFAULT_CONNECT_CONFIG);
  });

  it("preserves user overrides while filling in defaults for unspecified leaves (task 6)", () => {
    const config = emitPluginOutput({
      packages: [],
      projectRoot,
      connect: {
        branding: { appName: "My App" },
        drives: { allowAddDrive: false },
      },
    });

    const connect = config.connect as Record<string, Record<string, unknown>>;
    // User overrides win
    expect((connect.branding as Record<string, unknown>).appName).toBe(
      "My App",
    );
    expect((connect.drives as Record<string, unknown>).allowAddDrive).toBe(
      false,
    );
    // Defaults fill in unspecified leaves
    expect((connect.app as Record<string, unknown>).logLevel).toBe("info");
    expect((connect.renown as Record<string, unknown>).url).toBe(
      "https://www.renown.id",
    );
    expect(
      (connect.drives.sections as Record<string, Record<string, unknown>>)
        .remote.enabled,
    ).toBe(true);
  });
});

// Drift guard: ensures the JSON Schema's declared `default` for every
// `connect.*` leaf agrees with the value at the same path in
// DEFAULT_CONNECT_CONFIG. Keeps the two from silently diverging — schema
// defaults are documentation for editors / hover tooltips; the constant is
// what runtime code actually uses.
describe("DEFAULT_CONNECT_CONFIG ↔ schema default sync", () => {
  type LeafDefault = { path: string; value: unknown };

  function collectSchemaDefaults(
    node: unknown,
    pathLabel: string,
    out: LeafDefault[],
  ): void {
    if (!node || typeof node !== "object") return;
    const obj = node as Record<string, unknown>;
    if ("default" in obj && !obj.properties) {
      out.push({ path: pathLabel, value: obj.default });
    }
    if (obj.properties && typeof obj.properties === "object") {
      for (const [key, child] of Object.entries(
        obj.properties as Record<string, unknown>,
      )) {
        collectSchemaDefaults(
          child,
          pathLabel ? `${pathLabel}.${key}` : key,
          out,
        );
      }
    }
  }

  function getAtPath(obj: unknown, dotted: string): unknown {
    return dotted.split(".").reduce<unknown>((acc, key) => {
      if (!acc || typeof acc !== "object") return undefined;
      return (acc as Record<string, unknown>)[key];
    }, obj);
  }

  it("every schema default at connect.* exists in DEFAULT_CONNECT_CONFIG with the same value", () => {
    const connectSchema = (
      runtimeConfigSchema.properties as unknown as Record<string, unknown>
    ).connect;
    const defaults: LeafDefault[] = [];
    collectSchemaDefaults(connectSchema, "", defaults);

    expect(defaults.length).toBeGreaterThan(0);

    for (const { path: leafPath, value } of defaults) {
      const actual = getAtPath(DEFAULT_CONNECT_CONFIG, leafPath);
      expect(
        actual,
        `DEFAULT_CONNECT_CONFIG.${leafPath} should equal the schema's declared default`,
      ).toEqual(value);
    }
  });
});
