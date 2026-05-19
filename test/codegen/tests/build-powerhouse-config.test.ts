import { buildPowerhouseConfigTemplate } from "@powerhousedao/codegen/templates";
import { DEFAULT_CONNECT_CONFIG } from "@powerhousedao/shared/connect";
import { describe, expect, test } from "bun:test";

type Plain = Record<string, unknown>;

function isPlainObject(v: unknown): v is Plain {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Walks two objects in lockstep, asserting every leaf in `expected` is also
 * present in `actual` with the same value. Used to verify the scaffolded
 * config carries every DEFAULT_CONNECT_CONFIG field — the "every leaf
 * populated" invariant that `ph vetra` and similar dev consumers depend on.
 */
function assertContainsLeaves(
  actual: unknown,
  expected: unknown,
  path: string = "",
): void {
  if (Array.isArray(expected)) {
    expect(Array.isArray(actual)).toBe(true);
    expect(actual).toEqual(expected);
    return;
  }
  if (isPlainObject(expected)) {
    expect(isPlainObject(actual)).toBe(true);
    for (const key of Object.keys(expected)) {
      const childPath = path ? `${path}.${key}` : key;
      expect(
        (actual as Plain)[key],
        `missing/mismatched leaf at ${childPath}`,
      ).not.toBeUndefined();
      assertContainsLeaves((actual as Plain)[key], expected[key], childPath);
    }
    return;
  }
  expect(actual).toEqual(expected);
}

describe("buildPowerhouseConfigTemplate", () => {
  test("emits valid JSON", async () => {
    const out = await buildPowerhouseConfigTemplate({});
    expect(typeof out).toBe("string");
    expect(() => {
      JSON.parse(out);
    }).not.toThrow();
  });

  test("scaffolded source carries every leaf from DEFAULT_CONNECT_CONFIG", async () => {
    const out = await buildPowerhouseConfigTemplate({});
    const parsed = JSON.parse(out) as Plain;
    expect(parsed.connect).toBeDefined();
    // Every leaf in DEFAULT_CONNECT_CONFIG must be present at the same path
    // and with the same value inside `connect`. `ph vetra` and similar dev
    // consumers read the source file directly (no dist merge), so a missing
    // leaf surfaces as `undefined` at the consumer.
    assertContainsLeaves(parsed.connect, DEFAULT_CONNECT_CONFIG);
  });

  test("preserves existing top-level fields", async () => {
    const out = await buildPowerhouseConfigTemplate({});
    const parsed = JSON.parse(out) as Plain;
    expect(parsed.$schema).toContain("source-config.schema.json");
    expect(parsed.documentModelsDir).toBe("./document-models");
    expect(parsed.editorsDir).toBe("./editors");
    expect(parsed.processorsDir).toBe("./processors");
    expect(parsed.subgraphsDir).toBe("./subgraphs");
    expect(parsed.studio).toEqual({ port: 3000 });
    expect(parsed.reactor).toEqual({ port: 4001 });
    expect(parsed.packages).toEqual([]);
    expect(typeof parsed.packageRegistryUrl).toBe("string");
  });

  test("omits `vetra` when no remoteDrive provided", async () => {
    const out = await buildPowerhouseConfigTemplate({});
    const parsed = JSON.parse(out) as Plain;
    expect(parsed.vetra).toBeUndefined();
  });

  test("emits `vetra` block when remoteDrive is provided", async () => {
    const remoteDrive = "https://reactor.example.com/d/vetra-abc123";
    const out = await buildPowerhouseConfigTemplate({ remoteDrive });
    const parsed = JSON.parse(out) as Plain;
    expect(parsed.vetra).toEqual({
      driveId: "vetra-abc123",
      driveUrl: remoteDrive,
    });
  });
});
