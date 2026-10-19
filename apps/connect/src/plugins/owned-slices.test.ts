import { CONNECT_PLUGIN_OWNED_SLICES } from "@powerhousedao/host-core";
import type { PHConnectRuntimeConfig } from "@powerhousedao/shared/clis";
import { describe, expect, it, vi } from "vitest";
import { applyComposition } from "../plugin-host.js";

// host-core's dead-config warning (typed-host-configs 1.6) declares, as data,
// which connect config slices each built-in Connect plugin owns and what
// Connect serves there while the plugin is absent. That table must match what
// plugin-host actually zeroes; this test pins the two together.

/** A served config where every owned slice holds a non-zero value. */
function live(): PHConnectRuntimeConfig {
  return {
    drives: {
      allowAddDrive: true,
      sections: {
        remote: { enabled: true, allowAdd: true, allowDelete: true },
        local: { enabled: true, allowAdd: true, allowDelete: true },
      },
      icons: { folder: "data:image/png;base64,AA==" },
    },
    home: { background: "data:image/png;base64,AA==" },
    sentry: { dsn: "https://k@sentry.example/1", env: "dev" },
    openPanel: { clientId: "abc", trackUiEvents: true, trackOperations: true },
    ai: { assistantEnabled: true },
    app: { studioMode: true, workflowsEnabled: true },
  };
}

function valueAt(root: unknown, dotted: string): unknown {
  let current = root;
  for (const key of dotted.split(".")) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

/** Dot paths of every leaf that differs between two JSON-ish values. */
function changedLeaves(a: unknown, b: unknown, prefix = ""): string[] {
  const isObject = (v: unknown): v is Record<string, unknown> =>
    v !== null && typeof v === "object" && !Array.isArray(v);
  if (!isObject(a) || !isObject(b)) {
    return JSON.stringify(a) === JSON.stringify(b) ? [] : [prefix];
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].flatMap((key) =>
    changedLeaves(a[key], b[key], prefix ? `${prefix}.${key}` : key),
  );
}

describe("CONNECT_PLUGIN_OWNED_SLICES matches plugin-host's absence zeroing", () => {
  vi.spyOn(console, "info").mockImplementation(() => {});

  const owners = Object.keys(CONNECT_PLUGIN_OWNED_SLICES);

  it.each(owners)(
    "without %s, Connect serves the declared absent value at each of its slices",
    async (owner) => {
      const others = owners.filter((module) => module !== owner);
      const out = await applyComposition({
        ...live(),
        composition: others.map((module) => ({ module })),
      });
      for (const { path, absent } of CONNECT_PLUGIN_OWNED_SLICES[owner]
        .slices) {
        expect(valueAt(out, path), path).toEqual(absent);
      }
    },
  );

  it("every value an empty composition zeroes is an owned slice", async () => {
    const input = live();
    const out = await applyComposition({ ...input, composition: [] });
    const owned = Object.values(CONNECT_PLUGIN_OWNED_SLICES).flatMap(
      ({ slices }) => slices.map((slice) => slice.path),
    );
    const changed = changedLeaves(input, out).filter(
      (path) => path !== "composition",
    );
    for (const path of changed) {
      expect(
        owned.some((slice) => path === slice || path.startsWith(`${slice}.`)),
        `${path} is zeroed but not declared as owned`,
      ).toBe(true);
    }
  });
});
