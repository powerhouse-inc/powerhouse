import { buildPowerhouseConfigTemplate } from "@powerhousedao/codegen/templates";
import { deriveProjectPorts } from "@powerhousedao/shared/clis/project-ports";
import { DEFAULT_CONNECT_CONFIG } from "@powerhousedao/shared/connect";
import { DEFAULT_REGISTRY_URL } from "@powerhousedao/shared/registry";
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

// `name` is required: the scaffolded ports are derived from it, and there is
// no safe fallback — defaulting to the standard 4001 would put every project
// back on one port, which is the collision the per-project assignment exists
// to prevent.
const NAME = "test-project";

describe("buildPowerhouseConfigTemplate", () => {
  test("emits valid JSON", async () => {
    const out = await buildPowerhouseConfigTemplate({ name: NAME });
    expect(typeof out).toBe("string");
    expect(() => {
      JSON.parse(out);
    }).not.toThrow();
  });

  test("scaffolded source carries every leaf from DEFAULT_CONNECT_CONFIG", async () => {
    const out = await buildPowerhouseConfigTemplate({ name: NAME });
    const parsed = JSON.parse(out) as Plain;
    expect(parsed.connect).toBeDefined();
    // Every leaf in DEFAULT_CONNECT_CONFIG must be present at the same path
    // and with the same value inside `connect`. `ph vetra` and similar dev
    // consumers read the source file directly (no dist merge), so a missing
    // leaf surfaces as `undefined` at the consumer.
    assertContainsLeaves(parsed.connect, DEFAULT_CONNECT_CONFIG);
  });

  test("preserves existing top-level fields", async () => {
    const out = await buildPowerhouseConfigTemplate({ name: NAME });
    const parsed = JSON.parse(out) as Plain;
    expect(parsed.$schema).toContain("source-config.schema.json");
    expect(parsed.documentModelsDir).toBe("./document-models");
    expect(parsed.editorsDir).toBe("./editors");
    expect(parsed.processorsDir).toBe("./processors");
    expect(parsed.subgraphsDir).toBe("./subgraphs");
    expect(parsed.packages).toEqual([]);
    expect(parsed.packageRegistryUrl).toBe(DEFAULT_REGISTRY_URL);
  });

  test("assigns the ports derived from the project name", async () => {
    const out = await buildPowerhouseConfigTemplate({ name: NAME });
    const parsed = JSON.parse(out) as Plain;
    const ports = deriveProjectPorts(NAME);
    expect(parsed.studio).toEqual({ port: ports.studioPort });
    expect(parsed.reactor).toEqual({ port: ports.switchboardPort });
  });

  test("gives two differently named projects different ports", async () => {
    const a = JSON.parse(
      await buildPowerhouseConfigTemplate({ name: "project-a" }),
    ) as { reactor: { port: number } };
    const b = JSON.parse(
      await buildPowerhouseConfigTemplate({ name: "project-b" }),
    ) as { reactor: { port: number } };
    expect(a.reactor.port).not.toBe(b.reactor.port);
  });

  test("always emits `vetra` carrying the assigned connect port", async () => {
    const out = await buildPowerhouseConfigTemplate({ name: NAME });
    const parsed = JSON.parse(out) as Plain;
    // The block is no longer remote-drive-only: it is where `ph vetra`'s
    // Connect port lives, so every scaffolded project has one.
    expect(parsed.vetra).toEqual({
      connectPort: deriveProjectPorts(NAME).vetraConnectPort,
    });
  });

  test("emits drive coordinates alongside the port when remoteDrive is provided", async () => {
    const remoteDrive = "https://reactor.example.com/d/vetra-abc123";
    const out = await buildPowerhouseConfigTemplate({
      name: NAME,
      remoteDrive,
    });
    const parsed = JSON.parse(out) as Plain;
    expect(parsed.vetra).toEqual({
      connectPort: deriveProjectPorts(NAME).vetraConnectPort,
      driveId: "vetra-abc123",
      driveUrl: remoteDrive,
    });
  });
});
