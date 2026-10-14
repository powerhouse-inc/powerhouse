import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  entryActiveForVerb,
  hostTypeSatisfies,
  mergeContributions,
  normalizePluginEntries,
  normalizePluginEntry,
  PluginError,
  registerHostType,
  resolveHostPlugins,
  resolveOrder,
  runObserveHook,
  runProvideHook,
  runTransformHook,
  type HostPlugin,
} from "../src/plugins.js";

const temporary: string[] = [];
afterEach(() => {
  for (const dir of temporary.splice(0)) {
    rmSync(dir, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  }
});

function tempDir(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  temporary.push(dir);
  return dir;
}

function makeProject(): string {
  const dir = tempDir("ph-plugins-");
  writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "plugin-lab", type: "module" }),
  );
  return dir;
}

function writePlugin(
  projectRoot: string,
  name: string,
  indexSource: string,
): void {
  const pkgDir = path.join(projectRoot, "node_modules", name);
  mkdirSync(pkgDir, { recursive: true });
  writeFileSync(
    path.join(pkgDir, "package.json"),
    JSON.stringify({
      name,
      type: "module",
      exports: { ".": { import: "./index.js", default: "./index.js" } },
    }),
  );
  writeFileSync(path.join(pkgDir, "index.js"), indexSource);
}

/* ------------------------------------------------------------------ entries */

describe("normalizePluginEntry / normalizePluginEntries", () => {
  it("decomposes a string entry to defaults", () => {
    expect(normalizePluginEntry("my-plugin")).toEqual({
      module: "my-plugin",
      enabled: true,
      verbs: "*",
      config: {},
    });
  });

  it("fills in object defaults", () => {
    expect(normalizePluginEntry({ module: "my-plugin" })).toEqual({
      module: "my-plugin",
      enabled: true,
      verbs: "*",
      config: {},
    });
  });

  it("preserves explicit object fields", () => {
    expect(
      normalizePluginEntry({
        module: "my-plugin",
        enabled: false,
        verbs: ["dev"],
        config: { a: 1 },
      }),
    ).toEqual({
      module: "my-plugin",
      enabled: false,
      verbs: ["dev"],
      config: { a: 1 },
    });
  });

  it("throws PluginError naming a duplicate module", () => {
    expect(() =>
      normalizePluginEntries(["dup-plugin", "dup-plugin"], "host.js"),
    ).toThrow(PluginError);
    expect(() =>
      normalizePluginEntries(["dup-plugin", "dup-plugin"], "host.js"),
    ).toThrow(/dup-plugin.*listed twice/s);
  });
});

describe("entryActiveForVerb", () => {
  it("is inactive when enabled:false, regardless of verb", () => {
    const entry = normalizePluginEntry({ module: "m", enabled: false });
    expect(entryActiveForVerb(entry, "dev")).toBe(false);
    expect(entryActiveForVerb(entry, "run")).toBe(false);
  });

  it('verbs:"*" matches any verb', () => {
    const entry = normalizePluginEntry("m");
    expect(entryActiveForVerb(entry, "dev")).toBe(true);
    expect(entryActiveForVerb(entry, "build")).toBe(true);
  });

  it('verbs:["dev"] matches only "dev"', () => {
    const entry = normalizePluginEntry({ module: "m", verbs: ["dev"] });
    expect(entryActiveForVerb(entry, "dev")).toBe(true);
    expect(entryActiveForVerb(entry, "run")).toBe(false);
  });
});

/* ---------------------------------------------------------------- hierarchy */

describe("hostTypeSatisfies", () => {
  it('connect satisfies "reactor" and "connect"', () => {
    expect(hostTypeSatisfies("connect", "reactor")).toBe(true);
    expect(hostTypeSatisfies("connect", "connect")).toBe(true);
  });

  it('switchboard satisfies "reactor"', () => {
    expect(hostTypeSatisfies("switchboard", "reactor")).toBe(true);
  });

  it('compound does NOT satisfy "reactor" (its own branch)', () => {
    expect(hostTypeSatisfies("compound", "reactor")).toBe(false);
  });

  it('reactor does not satisfy "connect"', () => {
    expect(hostTypeSatisfies("reactor", "connect")).toBe(false);
  });
});

describe("registerHostType", () => {
  it("re-registering the same id with the same parent is a no-op", () => {
    registerHostType("test-host-type-a", "reactor");
    expect(() => registerHostType("test-host-type-a", "reactor")).not.toThrow();
    expect(hostTypeSatisfies("test-host-type-a", "reactor")).toBe(true);
  });

  it("re-registering with a DIFFERENT parent throws", () => {
    registerHostType("test-host-type-b", "reactor");
    expect(() => registerHostType("test-host-type-b", "compound")).toThrow(
      PluginError,
    );
    expect(() => registerHostType("test-host-type-b", "compound")).toThrow(
      /test-host-type-b.*already registered.*reactor/s,
    );
  });
});

/* ----------------------------------------------------------------- ordering */

describe("resolveOrder", () => {
  it("buckets pre -> normal -> post, stable within each bucket", () => {
    const a: HostPlugin = { name: "a" };
    const b: HostPlugin = { name: "b", enforce: "pre" };
    const c: HostPlugin = { name: "c", enforce: "post" };
    const d: HostPlugin = { name: "d" };
    const order = resolveOrder([a, b, c, d]).map((p) => p.name);
    expect(order).toEqual(["b", "a", "d", "c"]);
  });

  it("dependsOn reorders within the bucket", () => {
    const b: HostPlugin = { name: "b", dependsOn: ["a"] };
    const a: HostPlugin = { name: "a" };
    // declared order is [b, a] but b depends on a, so a must come first
    const order = resolveOrder([b, a]).map((p) => p.name);
    expect(order).toEqual(["a", "b"]);
  });

  it("missing dependency throws naming both plugin and dependency", () => {
    const p: HostPlugin = { name: "p", dependsOn: ["missing"] };
    expect(() => resolveOrder([p])).toThrow(PluginError);
    expect(() => resolveOrder([p])).toThrow(/"p".*"missing"/s);
  });

  it("cycle throws naming the chain", () => {
    const a: HostPlugin = { name: "a", dependsOn: ["b"] };
    const b: HostPlugin = { name: "b", dependsOn: ["a"] };
    expect(() => resolveOrder([a, b])).toThrow(PluginError);
    expect(() => resolveOrder([a, b])).toThrow(/a -> b -> a/);
  });
});

/* -------------------------------------------------------------------- hooks */

describe("runProvideHook", () => {
  it("returns undefined with zero implementations", async () => {
    const plugins: HostPlugin[] = [{ name: "a" }];
    expect(await runProvideHook("hello", plugins, {})).toBeUndefined();
  });

  it("returns the value with exactly one implementation", async () => {
    const plugins: HostPlugin[] = [{ name: "a", hooks: { hello: () => 42 } }];
    expect(await runProvideHook("hello", plugins, {})).toBe(42);
  });

  it("throws naming both plugins when two implementations compete", async () => {
    const plugins: HostPlugin[] = [
      { name: "a", hooks: { hello: () => 1 } },
      { name: "b", hooks: { hello: () => 2 } },
    ];
    await expect(runProvideHook("hello", plugins, {})).rejects.toThrow(
      PluginError,
    );
    await expect(runProvideHook("hello", plugins, {})).rejects.toThrow(
      /"a" and "b"/,
    );
  });
});

describe("runTransformHook", () => {
  it("chains transforms in plugin order (string concat proof)", async () => {
    const plugins: HostPlugin[] = [
      { name: "a", hooks: { t: (v: string) => `${v}a` } },
      { name: "b", hooks: { t: (v: string) => `${v}b` } },
      { name: "c" }, // no implementation: passthrough
    ];
    const result = await runTransformHook("t", plugins, {}, "seed-");
    expect(result).toBe("seed-ab");
  });
});

describe("runObserveHook", () => {
  it("calls every implementation, awaiting sync and async alike", async () => {
    const calls: string[] = [];
    const plugins: HostPlugin[] = [
      {
        name: "sync-observer",
        hooks: {
          watch: () => {
            calls.push("sync");
          },
        },
      },
      {
        name: "async-observer",
        hooks: {
          watch: async () => {
            await new Promise((resolve) => setTimeout(resolve, 5));
            calls.push("async");
          },
        },
      },
      { name: "no-impl" },
    ];
    await runObserveHook("watch", plugins, {});
    expect(calls.sort()).toEqual(["async", "sync"]);
  });
});

/* ------------------------------------------------------------ contributions */

describe("mergeContributions", () => {
  it("orders by provenance (built-in < local < dependency), concatenates per kind, records sources", () => {
    const resolved = [
      {
        plugin: {
          name: "dep1",
          contributions: { drives: ["d3"], packages: ["p-dep"] },
        } as HostPlugin,
        provenance: "dependency" as const,
      },
      {
        plugin: {
          name: "built1",
          contributions: { drives: ["d1"] },
        } as HostPlugin,
        provenance: "built-in" as const,
      },
      {
        plugin: {
          name: "local1",
          contributions: { drives: ["d2"], packages: ["p-local"] },
        } as HostPlugin,
        provenance: "local" as const,
      },
    ];
    const merged = mergeContributions(resolved);
    expect(merged.drives).toEqual([
      { value: "d1", source: { pluginName: "built1", provenance: "built-in" } },
      { value: "d2", source: { pluginName: "local1", provenance: "local" } },
      { value: "d3", source: { pluginName: "dep1", provenance: "dependency" } },
    ]);
    expect(merged.packages).toEqual([
      {
        value: "p-local",
        source: { pluginName: "local1", provenance: "local" },
      },
      {
        value: "p-dep",
        source: { pluginName: "dep1", provenance: "dependency" },
      },
    ]);
  });

  it("returns an empty object when nothing contributes", () => {
    expect(
      mergeContributions([{ plugin: { name: "a" }, provenance: "built-in" }]),
    ).toEqual({});
  });
});

/* --------------------------------------------------------------- resolution */

describe("resolveHostPlugins", () => {
  it("rejects config passed to a plain-object plugin with no configSchema", async () => {
    const dir = makeProject();
    writePlugin(
      dir,
      "plain-plugin",
      `export default { name: "plain-plugin" };`,
    );
    await expect(
      resolveHostPlugins(
        dir,
        "reactor",
        "run",
        [{ module: "plain-plugin", config: { foo: 1 } }],
        "host.js",
      ),
    ).rejects.toThrow(/plain-plugin.*takes no config/s);
  });

  it("accepts a plain-object plugin with no config passed", async () => {
    const dir = makeProject();
    writePlugin(
      dir,
      "plain-plugin",
      `export default { name: "plain-plugin" };`,
    );
    const resolved = await resolveHostPlugins(
      dir,
      "reactor",
      "run",
      ["plain-plugin"],
      "host.js",
    );
    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.plugin.name).toBe("plain-plugin");
    expect(resolved[0]?.provenance).toBe("dependency");
  });

  it("passes entry config into a factory export", async () => {
    const dir = makeProject();
    writePlugin(
      dir,
      "factory-plugin",
      `export default (config) => ({ name: "factory-plugin", contributions: { seen: [config] } });`,
    );
    const resolved = await resolveHostPlugins(
      dir,
      "reactor",
      "run",
      [{ module: "factory-plugin", config: { greeting: "hi" } }],
      "host.js",
    );
    expect(resolved[0]?.plugin.contributions?.seen).toEqual([
      { greeting: "hi" },
    ]);
  });

  it("names the plugin when configSchema validation fails", async () => {
    const dir = makeProject();
    writePlugin(
      dir,
      "schema-plugin",
      `export default {
        name: "schema-plugin",
        configSchema: {
          safeParse(value) {
            if (value && typeof value.port === "number") {
              return { success: true, data: value };
            }
            return {
              success: false,
              error: { issues: [{ path: ["port"], message: "Expected number, received string" }] },
            };
          },
        },
      };`,
    );
    await expect(
      resolveHostPlugins(
        dir,
        "reactor",
        "run",
        [{ module: "schema-plugin", config: { port: "nope" } }],
        "host.js",
      ),
    ).rejects.toThrow(/schema-plugin.*invalid/s);
  });

  it("throws on an appliesTo mismatch (plugin wants switchboard, host is connect)", async () => {
    const dir = makeProject();
    writePlugin(
      dir,
      "switchboard-only",
      `export default { name: "switchboard-only", appliesTo: "switchboard" };`,
    );
    await expect(
      resolveHostPlugins(
        dir,
        "connect",
        "run",
        ["switchboard-only"],
        "host.js",
      ),
    ).rejects.toThrow(
      /switchboard-only.*applies to "switchboard".*host is "connect"/s,
    );
  });

  it("skips verb-filtered entries entirely — a non-matching verb never resolves the module", async () => {
    const dir = makeProject();
    // deliberately no package written for "does-not-exist": resolution must
    // never be attempted because the entry is inactive at verb "run".
    const resolved = await resolveHostPlugins(
      dir,
      "reactor",
      "run",
      [{ module: "does-not-exist", verbs: ["dev"] }],
      "host.js",
    );
    expect(resolved).toEqual([]);
  });
});
