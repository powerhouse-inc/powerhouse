import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  collectPackagePwaContributions,
  collectProjectPwaContribution,
  validateProjectPwaConfig,
} from "./pwa-packages.js";
import { connectPwaPlugins } from "./pwa.js";

describe("connectPwaPlugins", () => {
  it("emits a single self-destroying worker when offline is disabled", () => {
    const plugins = connectPwaPlugins({ offlineEnabled: false });
    expect(Array.isArray(plugins)).toBe(true);
    expect(plugins).toHaveLength(1);
  });

  it("constructs the icons + PWA plugins with merged overrides (regex rule)", () => {
    // Exercises applyPwaOverrides + VitePWA construction with an override that
    // carries a manifest scalar and a regex-based runtime-caching rule.
    expect(() =>
      connectPwaPlugins({
        offlineEnabled: true,
        pwa: {
          manifest: { theme_color: "#000000", name: "Custom" },
          maximumFileSizeToCacheInBytes: 32 * 1024 * 1024,
          runtimeCaching: [
            {
              urlPattern: { source: "^https://api\\.acme\\.io/", flags: "i" },
              handler: "NetworkFirst",
              options: { cacheName: "acme" },
            },
          ],
        },
      }),
    ).not.toThrow();
    const plugins = connectPwaPlugins({ offlineEnabled: true, pwa: {} });
    // connectPwaIconsPlugin + the VitePWA plugins.
    expect(plugins.length).toBeGreaterThan(1);
  });

  it("constructs the plugins with a contributed file handler", () => {
    expect(() =>
      connectPwaPlugins({
        offlineEnabled: true,
        pwa: {
          manifest: {
            file_handlers: [
              { accept: { "application/x-custom+zip": [".custom"] } },
            ],
          },
        },
      }),
    ).not.toThrow();
  });
});

describe("pwa fragment collection", () => {
  let projectRoot: string;

  function writePackage(
    name: string,
    manifest: Record<string, unknown>,
    opts: {
      exportsManifest?: boolean | string;
    } = { exportsManifest: true },
  ): void {
    const dir = join(projectRoot, "node_modules", name);
    mkdirSync(join(dir, "dist"), { recursive: true });
    const manifestExport =
      typeof opts.exportsManifest === "string"
        ? opts.exportsManifest
        : "./dist/powerhouse.manifest.json";
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({
        name,
        files: ["dist"],
        exports: opts.exportsManifest ? { "./manifest": manifestExport } : {},
      }),
    );
    writeFileSync(
      join(dir, "dist", "powerhouse.manifest.json"),
      JSON.stringify(manifest),
    );
  }

  const local = (packageName: string) => ({
    packageName,
    provider: "local" as const,
  });
  const registry = (packageName: string, version?: string) => ({
    packageName,
    version,
    provider: "registry" as const,
  });

  /** fetch stub serving manifests keyed by full URL; anything else 404s. */
  const fetchFor =
    (byUrl: Record<string, unknown>): typeof fetch =>
    (input) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      const body = byUrl[url];
      return Promise.resolve(
        body === undefined
          ? new Response("not found", { status: 404 })
          : new Response(JSON.stringify(body), { status: 200 }),
      );
    };

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), "ph-pwa-collect-"));
  });
  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  describe("collectPackagePwaContributions", () => {
    it("reads a pwa fragment from a local package's shipped manifest via ./manifest", async () => {
      writePackage("@acme/pkg", {
        name: "Acme Package",
        pwa: {
          manifest: { theme_color: "#0af" },
          runtimeCaching: [{ urlPattern: "x", handler: "CacheFirst" }],
        },
      });
      const contributions = await collectPackagePwaContributions({
        packages: [local("@acme/pkg")],
        projectRoot,
      });
      expect(contributions).toHaveLength(1);
      expect(contributions[0].source).toBe("Acme Package");
      expect(contributions[0].config.manifest?.theme_color).toBe("#0af");
    });

    it("falls back to dist/powerhouse.manifest.json when ./manifest isn't exported", async () => {
      writePackage(
        "@acme/no-export",
        { name: "NoExport", pwa: { manifest: { name: "X" } } },
        { exportsManifest: false },
      );
      const contributions = await collectPackagePwaContributions({
        packages: [local("@acme/no-export")],
        projectRoot,
      });
      expect(contributions).toHaveLength(1);
      expect(contributions[0].config.manifest?.name).toBe("X");
    });

    it("skips packages with neither a pwa fragment nor a category, and missing packages", async () => {
      writePackage("@acme/plain", { name: "Plain" });
      const contributions = await collectPackagePwaContributions({
        packages: [local("@acme/plain"), local("@acme/absent")],
        projectRoot,
      });
      expect(contributions).toEqual([]);
    });

    it("infers categories from a package's `category` field", async () => {
      // A package contributes its category even with no `pwa` block; two
      // packages' categories union into one deduped list.
      writePackage("@acme/a", { name: "A", category: "productivity" });
      writePackage("@acme/b", {
        name: "B",
        category: "finance",
        pwa: { manifest: { theme_color: "#0af" } },
      });
      const contributions = await collectPackagePwaContributions({
        packages: [local("@acme/a"), local("@acme/b")],
        projectRoot,
      });
      expect(contributions).toHaveLength(2);
      expect(contributions[0].config.manifest?.categories).toEqual([
        "productivity",
      ]);
      expect(contributions[1].config.manifest?.categories).toEqual(["finance"]);
    });

    it("warns and skips a non-object pwa field", async () => {
      const onWarn = vi.fn();
      writePackage("@acme/bad", { name: "Bad", pwa: "nope" });
      const contributions = await collectPackagePwaContributions({
        packages: [local("@acme/bad")],
        projectRoot,
        onWarn,
      });
      expect(contributions).toEqual([]);
      expect(onWarn).toHaveBeenCalledTimes(1);
    });

    it("warns and skips an invalid pwa fragment, naming the package and field", async () => {
      const onWarn = vi.fn();
      writePackage("@acme/invalid", {
        name: "Invalid",
        pwa: { runtimeCaching: [{ urlPattern: "x", handler: "Bogus" }] },
      });
      const contributions = await collectPackagePwaContributions({
        packages: [local("@acme/invalid")],
        projectRoot,
        onWarn,
      });
      expect(contributions).toEqual([]);
      expect(onWarn).toHaveBeenCalledTimes(1);
      const message = onWarn.mock.calls[0][0] as string;
      expect(message).toContain("Invalid");
      expect(message).toContain("handler");
    });

    it("warns and skips a non-compiling regex urlPattern", async () => {
      const onWarn = vi.fn();
      writePackage("@acme/badregex", {
        name: "BadRegex",
        pwa: {
          runtimeCaching: [
            { urlPattern: { source: "(" }, handler: "CacheFirst" },
          ],
        },
      });
      const contributions = await collectPackagePwaContributions({
        packages: [local("@acme/badregex")],
        projectRoot,
        onWarn,
      });
      expect(contributions).toEqual([]);
      expect(onWarn.mock.calls[0][0]).toContain("urlPattern");
    });

    it("ignores a ./manifest export that escapes the package directory", async () => {
      const onWarn = vi.fn();
      // A hostile export pointing outside the package; the in-package
      // conventional manifest must still be read as a fallback.
      writeFileSync(
        join(projectRoot, "evil.json"),
        JSON.stringify({ name: "Evil", pwa: { globPatterns: ["**/*.evil"] } }),
      );
      writePackage(
        "@acme/traversal",
        { name: "Traversal", pwa: { globPatterns: ["**/*.safe"] } },
        { exportsManifest: "../../../evil.json" },
      );
      const contributions = await collectPackagePwaContributions({
        packages: [local("@acme/traversal")],
        projectRoot,
        onWarn,
      });
      expect(onWarn.mock.calls[0][0]).toContain(
        "outside its package directory",
      );
      expect(contributions).toHaveLength(1);
      expect(contributions[0].config.globPatterns).toEqual(["**/*.safe"]);
    });

    it("fetches a registry package's manifest from the CDN (version-pinned)", async () => {
      const fetchImpl = vi.fn(
        fetchFor({
          "https://registry.example/-/cdn/@acme/remote@1.2.3/powerhouse.manifest.json":
            {
              name: "Remote",
              pwa: {
                runtimeCaching: [{ urlPattern: "r", handler: "CacheFirst" }],
              },
            },
        }),
      );
      const contributions = await collectPackagePwaContributions({
        packages: [registry("@acme/remote", "1.2.3")],
        projectRoot,
        registryUrl: "https://registry.example",
        fetchImpl,
      });
      expect(contributions).toHaveLength(1);
      expect(contributions[0].source).toBe("Remote");
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it("silently skips a registry package whose manifest 404s", async () => {
      const onWarn = vi.fn();
      const contributions = await collectPackagePwaContributions({
        packages: [registry("@acme/no-manifest")],
        projectRoot,
        registryUrl: "https://registry.example/-/cdn",
        onWarn,
        fetchImpl: fetchFor({}),
      });
      expect(contributions).toEqual([]);
      expect(onWarn).not.toHaveBeenCalled();
    });

    it("warns and skips when the registry is unreachable", async () => {
      const onWarn = vi.fn();
      const contributions = await collectPackagePwaContributions({
        packages: [registry("@acme/offline")],
        projectRoot,
        registryUrl: "https://registry.example",
        onWarn,
        fetchImpl: () => Promise.reject(new Error("network down")),
      });
      expect(contributions).toEqual([]);
      expect(onWarn.mock.calls[0][0]).toContain("network down");
    });

    it("warns and skips registry packages when no registry url is configured", async () => {
      const onWarn = vi.fn();
      const contributions = await collectPackagePwaContributions({
        packages: [registry("@acme/remote")],
        projectRoot,
        registryUrl: null,
        onWarn,
      });
      expect(contributions).toEqual([]);
      expect(onWarn.mock.calls[0][0]).toContain("packageRegistryUrl");
    });

    it("preserves the declared package order across providers", async () => {
      writePackage("@acme/local-pkg", {
        name: "LocalPkg",
        pwa: { globPatterns: ["**/*.a"] },
      });
      const fetchImpl = fetchFor({
        "https://registry.example/-/cdn/@acme/remote/powerhouse.manifest.json":
          { name: "RemotePkg", pwa: { globPatterns: ["**/*.b"] } },
      });
      const contributions = await collectPackagePwaContributions({
        packages: [registry("@acme/remote"), local("@acme/local-pkg")],
        projectRoot,
        registryUrl: "https://registry.example",
        fetchImpl,
      });
      expect(contributions.map((c) => c.source)).toEqual([
        "RemotePkg",
        "LocalPkg",
      ]);
    });
  });

  describe("collectProjectPwaContribution", () => {
    it("reads the project's root manifest and labels it by name", () => {
      writeFileSync(
        join(projectRoot, "powerhouse.manifest.json"),
        JSON.stringify({
          name: "@acme/project",
          pwa: { manifest: { theme_color: "#123" } },
        }),
      );
      const contribution = collectProjectPwaContribution({ projectRoot });
      expect(contribution?.source).toBe("@acme/project");
      expect(contribution?.config.manifest?.theme_color).toBe("#123");
    });

    it("prefers the root manifest over a (possibly stale) dist copy", () => {
      mkdirSync(join(projectRoot, "dist"), { recursive: true });
      writeFileSync(
        join(projectRoot, "dist", "powerhouse.manifest.json"),
        JSON.stringify({ name: "Dist", pwa: { globPatterns: ["**/*.dist"] } }),
      );
      writeFileSync(
        join(projectRoot, "powerhouse.manifest.json"),
        JSON.stringify({ name: "Root", pwa: { globPatterns: ["**/*.root"] } }),
      );
      const contribution = collectProjectPwaContribution({ projectRoot });
      expect(contribution?.source).toBe("Root");
    });

    it("falls back to the dist copy when there is no root manifest", () => {
      mkdirSync(join(projectRoot, "dist"), { recursive: true });
      writeFileSync(
        join(projectRoot, "dist", "powerhouse.manifest.json"),
        JSON.stringify({ name: "Dist", pwa: { globPatterns: ["**/*.dist"] } }),
      );
      const contribution = collectProjectPwaContribution({ projectRoot });
      expect(contribution?.source).toBe("Dist");
    });

    it("returns null silently when the project has no manifest", () => {
      expect(collectProjectPwaContribution({ projectRoot })).toBeNull();
    });

    it("returns null when the manifest has no pwa fragment and no category", () => {
      writeFileSync(
        join(projectRoot, "powerhouse.manifest.json"),
        JSON.stringify({ name: "@acme/project" }),
      );
      expect(collectProjectPwaContribution({ projectRoot })).toBeNull();
    });

    it("infers categories from the manifest `category` even without a pwa block", () => {
      writeFileSync(
        join(projectRoot, "powerhouse.manifest.json"),
        JSON.stringify({ name: "@acme/project", category: "productivity" }),
      );
      const contribution = collectProjectPwaContribution({ projectRoot });
      expect(contribution?.config.manifest?.categories).toEqual([
        "productivity",
      ]);
    });

    it("folds the inferred category alongside an authored pwa fragment", () => {
      writeFileSync(
        join(projectRoot, "powerhouse.manifest.json"),
        JSON.stringify({
          name: "@acme/project",
          category: "finance",
          pwa: { manifest: { theme_color: "#123" } },
        }),
      );
      const contribution = collectProjectPwaContribution({ projectRoot });
      expect(contribution?.config.manifest?.theme_color).toBe("#123");
      expect(contribution?.config.manifest?.categories).toEqual(["finance"]);
    });

    it("THROWS (fails the build) on an invalid pwa fragment — unlike a third-party package", () => {
      // The project's own manifest is the developer's config, so a removed /
      // unknown field (e.g. protocol_handlers) must fail loudly, not be skipped.
      writeFileSync(
        join(projectRoot, "powerhouse.manifest.json"),
        JSON.stringify({
          name: "@acme/project",
          pwa: { manifest: { protocol_handlers: [{ protocol: "web+ph" }] } },
        }),
      );
      expect(() => collectProjectPwaContribution({ projectRoot })).toThrow(
        /protocol_handlers|Unrecognized/,
      );
    });

    it("THROWS on an unknown pwa field typo in the project manifest", () => {
      writeFileSync(
        join(projectRoot, "powerhouse.manifest.json"),
        JSON.stringify({
          name: "@acme/project",
          pwa: { manifest: { theme_colr: "#123" } },
        }),
      );
      expect(() => collectProjectPwaContribution({ projectRoot })).toThrow(
        /theme_colr|Unrecognized/,
      );
    });
  });

  describe("validateProjectPwaConfig", () => {
    it("passes a valid config through", () => {
      const config = {
        manifest: { name: "Acme" },
        runtimeCaching: [
          {
            urlPattern: { source: "^https://api\\.acme\\.io/" },
            handler: "NetworkFirst" as const,
            options: { networkTimeoutSeconds: 3 },
          },
        ],
      };
      expect(
        validateProjectPwaConfig(config, "powerhouse.config.json"),
      ).toEqual(config);
    });

    it("throws with the config path and offending field on invalid config", () => {
      expect(() =>
        validateProjectPwaConfig(
          {
            runtimeCaching: [
              { urlPattern: { source: "(" }, handler: "CacheFirst" },
            ],
          },
          "/proj/powerhouse.config.json",
        ),
      ).toThrow(
        /Invalid connect\.pwa in \/proj\/powerhouse\.config\.json.*urlPattern/,
      );
    });

    it("passes a valid file_handlers block through", () => {
      const config = {
        manifest: {
          file_handlers: [
            {
              accept: { "application/x-custom+zip": [".custom", ".cst"] },
              icons: [{ src: "custom.png", sizes: "192x192" }],
              launch_type: "single-client" as const,
            },
          ],
          launch_handler: { client_mode: "focus-existing" as const },
        },
      };
      expect(
        validateProjectPwaConfig(config, "powerhouse.config.json"),
      ).toEqual(config);
    });

    it("rejects a file-handler extension without the leading dot", () => {
      // Chromium silently ignores dotless extensions — fail the build instead.
      expect(() =>
        validateProjectPwaConfig(
          {
            manifest: {
              file_handlers: [{ accept: { "application/x-a+zip": ["phd"] } }],
            },
          },
          "/proj/powerhouse.config.json",
        ),
      ).toThrow(/file_handlers.*accept|accept.*file_handlers/s);
    });

    it("rejects a file handler that tries to set its own action route", () => {
      // The open route is fixed by Connect (its runtime consumes the files);
      // contributors only declare accepted types.
      expect(() =>
        validateProjectPwaConfig(
          {
            manifest: {
              file_handlers: [
                { action: "/custom", accept: { "app/x": [".x"] } },
              ],
            },
          },
          "/proj/powerhouse.config.json",
        ),
      ).toThrow(/action/);
    });

    it("rejects an unknown manifest field instead of silently dropping it", () => {
      // Strict objects: a `manifest.nam` typo must fail the build, not be
      // stripped — a silently dropped field would quietly lose the branding.
      expect(() =>
        validateProjectPwaConfig(
          { manifest: { nam: "Acme" } },
          "/proj/powerhouse.config.json",
        ),
      ).toThrow(/[Uu]nrecognized/);
    });

    it("rejects an unknown top-level connect.pwa field", () => {
      // e.g. a `runtimeCahing` typo — likewise a build failure, not a no-op.
      expect(() =>
        validateProjectPwaConfig(
          { runtimeCahing: [] },
          "/proj/powerhouse.config.json",
        ),
      ).toThrow(/[Uu]nrecognized/);
    });

    it("passes the extended manifest members through", () => {
      const config = {
        manifest: {
          icons: [{ src: "pkg.png", sizes: "512x512" }],
          file_handlers: [{ accept: { "application/x-a+zip": [".aaa"] } }],
          launch_handler: { client_mode: "navigate-new" as const },
        },
      };
      expect(
        validateProjectPwaConfig(config, "powerhouse.config.json"),
      ).toEqual(config);
    });

    it("rejects an authored `categories` (derived from the manifest, not settable here)", () => {
      // categories is inferred from each manifest's `category` field, so setting
      // it under connect.pwa is a mistake the strict schema must surface.
      expect(() =>
        validateProjectPwaConfig(
          { manifest: { categories: ["productivity"] } },
          "/proj/powerhouse.config.json",
        ),
      ).toThrow(/[Uu]nrecognized/);
    });

    it("rejects a dropped manifest member (share_target/shortcuts/…)", () => {
      // These members were removed; the strict schema rejects them as unknown
      // rather than silently dropping them.
      for (const manifest of [
        { share_target: { params: { title: "t" } } },
        { shortcuts: [{ name: "New", url: "./new" }] },
        { screenshots: [{ src: "shot.png" }] },
        { display_override: ["window-controls-overlay"] },
      ]) {
        expect(() =>
          validateProjectPwaConfig(
            { manifest },
            "/proj/powerhouse.config.json",
          ),
        ).toThrow(/[Uu]nrecognized/);
      }
    });
  });

  describe("package fragments with file_handlers", () => {
    it("reads a valid file_handlers fragment from a local package", async () => {
      writePackage("@acme/files", {
        name: "Files",
        pwa: {
          manifest: {
            file_handlers: [{ accept: { "application/x-a+zip": [".aaa"] } }],
          },
        },
      });
      const contributions = await collectPackagePwaContributions({
        packages: [local("@acme/files")],
        projectRoot,
      });
      expect(contributions).toHaveLength(1);
      expect(
        contributions[0].config.manifest?.file_handlers?.[0].accept,
      ).toEqual({ "application/x-a+zip": [".aaa"] });
    });

    it("warns and skips a package fragment with malformed file_handlers", async () => {
      const onWarn = vi.fn();
      writePackage("@acme/badfiles", {
        name: "BadFiles",
        pwa: {
          manifest: {
            file_handlers: [{ accept: { "application/x-a+zip": ["aaa"] } }],
          },
        },
      });
      const contributions = await collectPackagePwaContributions({
        packages: [local("@acme/badfiles")],
        projectRoot,
        onWarn,
      });
      expect(contributions).toEqual([]);
      expect(onWarn).toHaveBeenCalledTimes(1);
      expect(onWarn.mock.calls[0][0]).toContain("BadFiles");
    });
  });
});
