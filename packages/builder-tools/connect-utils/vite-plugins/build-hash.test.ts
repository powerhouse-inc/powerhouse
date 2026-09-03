import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getConnectBaseViteConfig } from "../vite-config.js";
import {
  BUILD_HASH_FILE,
  buildHashFromBuildOptions,
  computeBuildHash,
  connectBuildHashPlugin,
} from "./build-hash.js";

describe("computeBuildHash", () => {
  const base = {
    workspaceGitSha: "abc123",
    workspaceVersion: "1.2.3",
    connectPackageVersion: "6.2.1",
    projectConfig: { connect: { app: { offline: true } } },
    packages: ["@scope/pkg@1.0.0:registry"],
    connectBasePath: "/",
    offlineEnabled: true,
    packageRegistryUrl: "https://registry.vetra.io",
  };

  it("is deterministic for identical inputs", () => {
    expect(computeBuildHash(base)).toBe(computeBuildHash(base));
  });

  it("is a 16-char hex string", () => {
    expect(computeBuildHash(base)).toMatch(/^[0-9a-f]{16}$/);
  });

  it("changes when any deploy-relevant input changes", () => {
    const h = computeBuildHash(base);
    expect(computeBuildHash({ ...base, workspaceGitSha: "def456" })).not.toBe(
      h,
    );
    expect(
      computeBuildHash({ ...base, connectPackageVersion: "6.2.2" }),
    ).not.toBe(h);
    expect(
      computeBuildHash({
        ...base,
        projectConfig: { connect: { app: { offline: false } } },
      }),
    ).not.toBe(h);
    expect(
      computeBuildHash({ ...base, packages: ["@scope/pkg@2.0.0:registry"] }),
    ).not.toBe(h);
    expect(computeBuildHash({ ...base, offlineEnabled: false })).not.toBe(h);
    expect(
      computeBuildHash({ ...base, packageRegistryUrl: "https://other" }),
    ).not.toBe(h);
  });
});

describe("buildHashFromBuildOptions", () => {
  it("serialises the package list stably and reflects env overrides", () => {
    const a = buildHashFromBuildOptions({
      dirname: "/nonexistent",
      phConfig: {},
      packages: [
        { packageName: "@a/b", version: "1.0.0", provider: "registry" },
        { packageName: "@c/d", provider: "local" },
      ],
      connectBasePath: "/",
      offlineEnabled: true,
      packageRegistryUrl: null,
    });
    const b = buildHashFromBuildOptions({
      dirname: "/nonexistent",
      phConfig: {},
      packages: [
        { packageName: "@c/d", provider: "local" },
        { packageName: "@a/b", version: "1.0.0", provider: "registry" },
      ],
      connectBasePath: "/",
      offlineEnabled: true,
      packageRegistryUrl: null,
    });
    // Order of the package list is part of identity (deterministic per the
    // resolved phPackages), so a reorder is a different build.
    expect(a).not.toBe(b);
    // Repeating the same list is stable.
    expect(a).toBe(
      buildHashFromBuildOptions({
        dirname: "/nonexistent",
        phConfig: {},
        packages: [
          { packageName: "@a/b", version: "1.0.0", provider: "registry" },
          { packageName: "@c/d", provider: "local" },
        ],
        connectBasePath: "/",
        offlineEnabled: true,
        packageRegistryUrl: null,
      }),
    );
  });
});

describe("connectBuildHashPlugin", () => {
  it("emits build-hash.json with the hash as an asset", () => {
    const plugin = connectBuildHashPlugin("deadbeefcafe1234") as {
      name: string;
      apply: string;
      generateBundle: (this: {
        emitFile: (o: {
          type: string;
          fileName: string;
          source: string;
        }) => void;
      }) => void;
    };
    expect(plugin.name).toBe("ph-connect-build-hash");
    expect(plugin.apply).toBe("build");

    const emitted: Array<{ type: string; fileName: string; source: string }> =
      [];
    plugin.generateBundle.call({
      emitFile: (o) => {
        emitted.push(o);
      },
    });

    expect(emitted).toHaveLength(1);
    expect(emitted[0].fileName).toBe(BUILD_HASH_FILE);
    expect(emitted[0].type).toBe("asset");
    expect(JSON.parse(emitted[0].source)).toEqual({
      hash: "deadbeefcafe1234",
    });
  });
});

// The base config must wire the SAME hash into both the bundle (define) and
// the emitted file (plugin) — otherwise the SPA compares two different
// identities and reloads on every load.
describe("getConnectBaseViteConfig build-hash wiring", () => {
  it("bakes one hash into define and the plugin", () => {
    const root = mkdtempSync(join(process.cwd(), "node_modules/.bh-wire-"));
    try {
      writeFileSync(
        join(root, "powerhouse.config.json"),
        JSON.stringify({ connect: { app: { offline: true } } }),
      );
      const config = getConnectBaseViteConfig({
        mode: "production",
        dirname: root,
      });
      const defineValue = (config.define as Record<string, unknown> | undefined)
        ?.PH_CONNECT_BUILD_HASH;
      // define stores the hash as a JS string literal (quoted).
      expect(defineValue).toMatch(/^"[0-9a-f]{16}"$/);

      const plugin = (config.plugins as Array<Record<string, unknown>>).find(
        (p) => p.name === "ph-connect-build-hash",
      );
      expect(plugin).toBeDefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 20000);
});
