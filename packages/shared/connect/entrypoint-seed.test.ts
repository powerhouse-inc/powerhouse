// Integration test for `docker/connect-entrypoint.sh`'s env → file merging.
// Verifies the operator-facing contract: the entrypoint reads a single
// `PH_CONNECT_CONFIG_JSON` env var and deep-merges it into the dist
// `powerhouse.config.json` with operator-wins semantics — a concrete leaf
// in the env JSON overwrites the baked value; a `null` leaf (or omitted
// key) keeps the file's value. `connect.app.basePath` is the exception:
// it is stripped from the operator payload because the base path is baked
// into the built asset URLs and cannot be changed at runtime.
//
// The test patches the script in a tmpdir to skip the nginx/envsubst calls
// (which require nginx + an /etc/nginx config that don't exist outside the
// container). The seeding logic itself runs unmodified against a tmpdir
// `RUNTIME_FILE` overridden via `DIST_DIR`.

import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const ENTRYPOINT_SOURCE = resolve(
  __dirname,
  "../../../docker/connect-entrypoint.sh",
);

function patchEntrypoint(originalPath: string, targetPath: string): void {
  // Strip the nginx-templating + nginx-launch portions; keep the seeding.
  // Anchored at the comment markers the script itself uses so this stays
  // robust against small textual edits.
  const original = readFileSync(originalPath, "utf-8");
  // Remove the envsubst line (nginx config templating).
  let patched = original.replace(
    /^envsubst .*$/m,
    'echo "skipping envsubst in test"',
  );
  // Remove `nginx -t` and the launch block.
  patched = patched.replace(
    /echo "Testing nginx configuration\.\.\.[\s\S]+$/m,
    'echo "skipping nginx launch in test"\n',
  );
  writeFileSync(targetPath, patched, { mode: 0o755 });
}

type Plain = Record<string, unknown>;

function readConfig(file: string): Plain {
  return JSON.parse(readFileSync(file, "utf-8")) as Plain;
}

function runEntrypoint(opts: {
  scriptPath: string;
  distDir: string;
  env: Record<string, string>;
}): { stdout: string; stderr: string; status: number | null } {
  const res = spawnSync("sh", [opts.scriptPath], {
    env: {
      // Provide only what the script reads — start from a clean slate so
      // host env vars don't bleed into the test.
      PATH: process.env.PATH,
      DIST_DIR: opts.distDir,
      ...opts.env,
    },
    encoding: "utf-8",
  });
  return {
    stdout: res.stdout,
    stderr: res.stderr,
    status: res.status,
  };
}

const NEEDS_JQ = (() => {
  try {
    statSync("/usr/bin/jq");
    return false; // jq is present
  } catch {
    // Try `which jq` via spawn
    const r = spawnSync("which", ["jq"], { encoding: "utf-8" });
    return r.status !== 0;
  }
})();

describe.skipIf(NEEDS_JQ)(
  "docker/connect-entrypoint.sh PH_CONNECT_CONFIG_JSON seeding",
  () => {
    let workDir: string;
    let distDir: string;
    let runtimeFile: string;
    let scriptPath: string;

    beforeEach(() => {
      workDir = mkdtempSync(join(tmpdir(), "entrypoint-seed-test-"));
      distDir = join(workDir, "dist");
      mkdirSync(distDir, { recursive: true });
      runtimeFile = join(distDir, "powerhouse.config.json");
      scriptPath = join(workDir, "connect-entrypoint.sh");
      patchEntrypoint(ENTRYPOINT_SOURCE, scriptPath);
    });

    afterEach(() => {
      rmSync(workDir, { recursive: true, force: true });
    });

    function seedFile(content: Plain): void {
      writeFileSync(runtimeFile, JSON.stringify(content, null, 2), "utf-8");
    }

    it("deep-merges a full PH_CONNECT_CONFIG_JSON into a clean file", () => {
      seedFile({
        schemaVersion: 2,
        packages: [],
        localPackage: null,
        connect: {},
      });

      const payload = {
        connect: {
          app: { basePath: "/sub", logLevel: "debug" },
          renown: {
            url: "https://renown.from-env",
            networkId: "eip155",
            chainId: 137,
          },
          drives: {
            preserveStrategy: "preserve-all",
            defaultDrives: [
              { url: "https://a.example", name: null, icon: null },
              { url: "https://b.example", name: null, icon: null },
            ],
          },
        },
      };

      const res = runEntrypoint({
        scriptPath,
        distDir,
        env: { PH_CONNECT_CONFIG_JSON: JSON.stringify(payload) },
      });
      expect(res.status).toBe(0);

      const connect = (readConfig(runtimeFile) as { connect: Plain })
        .connect as Record<string, Plain>;
      expect((connect.renown as Plain).url).toBe("https://renown.from-env");
      expect((connect.renown as Plain).networkId).toBe("eip155");
      expect((connect.renown as Plain).chainId).toBe(137);
      // basePath is stripped from the operator payload — never runtime-set.
      expect((connect.app as Plain).basePath).toBeUndefined();
      expect((connect.app as Plain).logLevel).toBe("debug");
      expect((connect.drives as Plain).preserveStrategy).toBe("preserve-all");
      expect((connect.drives as Plain).defaultDrives).toEqual([
        { url: "https://a.example", name: null, icon: null },
        { url: "https://b.example", name: null, icon: null },
      ]);
    });

    it("overwrites baked values with operator values, except basePath", () => {
      seedFile({
        schemaVersion: 2,
        packages: [],
        localPackage: null,
        connect: {
          branding: { appName: "Powerhouse Connect", homeBackground: null },
          renown: { url: "https://baked.example", networkId: "eip155" },
          app: { basePath: "/baked", logLevel: "warn" },
        },
      });

      const payload = {
        connect: {
          branding: { appName: "Operator Connect" },
          renown: { url: "https://operator.example", chainId: 137 },
          app: { basePath: "/operator", logLevel: "trace" },
        },
      };

      const res = runEntrypoint({
        scriptPath,
        distDir,
        env: { PH_CONNECT_CONFIG_JSON: JSON.stringify(payload) },
      });
      expect(res.status).toBe(0);

      const connect = (readConfig(runtimeFile) as { connect: Plain })
        .connect as Record<string, Plain>;
      // Operator values win over baked defaults
      expect((connect.branding as Plain).appName).toBe("Operator Connect");
      expect((connect.renown as Plain).url).toBe("https://operator.example");
      expect((connect.app as Plain).logLevel).toBe("trace");
      // Net-new leaves get filled in
      expect((connect.renown as Plain).chainId).toBe(137);
      // Untouched siblings keep their baked values
      expect((connect.renown as Plain).networkId).toBe("eip155");
      expect((connect.branding as Plain).homeBackground).toBeNull();
      // basePath is stripped from the operator payload — baked value kept
      expect((connect.app as Plain).basePath).toBe("/baked");
    });

    it("keeps baked values where the operator sends null", () => {
      seedFile({
        schemaVersion: 2,
        packages: [],
        localPackage: null,
        connect: {
          branding: { appName: "Powerhouse Connect", homeBackground: null },
          app: { logLevel: "info" },
        },
      });

      const payload = {
        connect: {
          branding: { appName: null, homeBackground: "https://bg.example" },
          app: { logLevel: null },
        },
      };

      const res = runEntrypoint({
        scriptPath,
        distDir,
        env: { PH_CONNECT_CONFIG_JSON: JSON.stringify(payload) },
      });
      expect(res.status).toBe(0);

      const connect = (readConfig(runtimeFile) as { connect: Plain })
        .connect as Record<string, Plain>;
      // null defers to the file's (default) value
      expect((connect.branding as Plain).appName).toBe("Powerhouse Connect");
      expect((connect.app as Plain).logLevel).toBe("info");
      // Concrete sibling still applies
      expect((connect.branding as Plain).homeBackground).toBe(
        "https://bg.example",
      );
    });

    it("is a no-op when PH_CONNECT_CONFIG_JSON is unset", () => {
      const baseline = {
        schemaVersion: 2,
        packages: [],
        localPackage: null,
        connect: {
          renown: { url: "https://baseline.example" },
        },
      } satisfies Plain;
      seedFile(baseline);

      const res = runEntrypoint({ scriptPath, distDir, env: {} });
      expect(res.status).toBe(0);

      // File is byte-identical: env-var-less boot is fully passive.
      expect(readConfig(runtimeFile)).toEqual(baseline);
    });

    it("applies explicit false values and fills missing subtrees", () => {
      // drives.sections.remote.enabled baked true; the operator turns it
      // off — `false` must count as a concrete value, not as "absent".
      seedFile({
        schemaVersion: 2,
        packages: [],
        localPackage: null,
        connect: {
          drives: {
            sections: {
              remote: { enabled: true, allowAdd: true, allowDelete: true },
            },
          },
        },
      });

      const payload = {
        connect: {
          drives: {
            sections: {
              remote: { enabled: false },
              local: { enabled: true, allowAdd: true, allowDelete: true },
            },
          },
        },
      };

      const res = runEntrypoint({
        scriptPath,
        distDir,
        env: { PH_CONNECT_CONFIG_JSON: JSON.stringify(payload) },
      });
      expect(res.status).toBe(0);

      const connect = (readConfig(runtimeFile) as { connect: Plain })
        .connect as Record<string, Plain>;
      const sections = (connect.drives as Plain).sections as Record<
        string,
        Plain
      >;
      const remote = sections.remote as Plain;
      const local = sections.local as Plain;
      // Explicit operator false overrides baked true
      expect(remote.enabled).toBe(false);
      // Untouched sibling leaves keep baked values
      expect(remote.allowAdd).toBe(true);
      expect(remote.allowDelete).toBe(true);
      // Entire missing subtree filled
      expect(local).toEqual({
        enabled: true,
        allowAdd: true,
        allowDelete: true,
      });
    });

    it("aborts when PH_CONNECT_CONFIG_JSON is not valid JSON", () => {
      seedFile({
        schemaVersion: 2,
        packages: [],
        localPackage: null,
        connect: {},
      });

      const res = runEntrypoint({
        scriptPath,
        distDir,
        env: { PH_CONNECT_CONFIG_JSON: "{ this is not json " },
      });
      expect(res.status).not.toBe(0);
      expect(res.stderr).toMatch(/not valid JSON/);
      // The file must remain unchanged on abort.
      const after = readConfig(runtimeFile) as Record<string, Plain>;
      expect(after.connect).toEqual({});
    });

    it("aborts when PH_CONNECT_CONFIG_JSON is JSON but not an object", () => {
      seedFile({
        schemaVersion: 2,
        packages: [],
        localPackage: null,
        connect: {},
      });

      const res = runEntrypoint({
        scriptPath,
        distDir,
        env: { PH_CONNECT_CONFIG_JSON: '"a string is not allowed"' },
      });
      expect(res.status).not.toBe(0);
      expect(res.stderr).toMatch(/must be a JSON object/);
    });

    it("ignores legacy per-field env vars (PH_CONNECT_RENOWN_URL, PH_CONNECT_DISABLE_*) — they are no longer wired", () => {
      seedFile({
        schemaVersion: 2,
        packages: [],
        localPackage: null,
        connect: {},
      });

      const res = runEntrypoint({
        scriptPath,
        distDir,
        env: {
          PH_CONNECT_RENOWN_URL: "https://legacy.example",
          PH_CONNECT_DISABLE_ADD_DRIVE: "true",
          PH_CONNECT_LOG_LEVEL: "debug",
          // No PH_CONNECT_CONFIG_JSON → nothing should get stamped.
        },
      });
      expect(res.status).toBe(0);

      const config = readConfig(runtimeFile) as Record<string, Plain>;
      // connect.* is still the empty object we seeded; legacy env vars no
      // longer leak in.
      expect(config.connect).toEqual({});
    });
  },
);

// The CSP `script-src` allowance for the package-registry CDN is baked into
// index.html at BUILD time from `phPackageRegistryUrl` (getConnectHtmlTags in
// connect-utils/vite-config.ts). The package LOADER, however, reads the
// registry at RUNTIME from the merged powerhouse.config.json. When an operator
// overrides `packageRegistryUrl` via PH_CONNECT_CONFIG_JSON (e.g. a dev-registry
// studio running a prod-built image), the loader fetches from the new registry
// but the baked CSP still only allows the old one — the browser blocks every
// package script. The entrypoint must therefore re-sync the CSP registry origin
// to the effective packageRegistryUrl after the config merge. Single quotes are
// HTML-escaped as `&#39;` in the built artifact — the real serialization.
describe.skipIf(NEEDS_JQ)(
  "docker/connect-entrypoint.sh CSP registry sync",
  () => {
    let workDir: string;
    let distDir: string;
    let runtimeFile: string;
    let indexFile: string;
    let scriptPath: string;

    // A minimal built index.html carrying the exact CSP <meta> the build emits.
    function cspMeta(registry: string | null): string {
      const origin = registry ? ` ${registry}` : "";
      return (
        `<meta http-equiv="Content-Security-Policy" content="script-src ` +
        `&#39;self&#39; &#39;unsafe-inline&#39; &#39;unsafe-eval&#39;${origin}; ` +
        `worker-src &#39;self&#39; blob:; object-src &#39;none&#39;; base-uri &#39;self&#39;;">`
      );
    }
    function indexHtml(registry: string | null): string {
      return `<!doctype html><html><head>${cspMeta(
        registry,
      )}<title>Connect</title></head><body><div id="root"></div></body></html>`;
    }
    // The script-src directive with a given registry origin, as it appears in
    // the served HTML. Note `&#39;` embeds its own `;`, so a naive split on `;`
    // is wrong — assert on this full fragment instead.
    function scriptSrcFragment(registry: string | null): string {
      const origin = registry ? ` ${registry}` : "";
      return `script-src &#39;self&#39; &#39;unsafe-inline&#39; &#39;unsafe-eval&#39;${origin};`;
    }

    beforeEach(() => {
      workDir = mkdtempSync(join(tmpdir(), "entrypoint-csp-test-"));
      distDir = join(workDir, "dist");
      mkdirSync(distDir, { recursive: true });
      runtimeFile = join(distDir, "powerhouse.config.json");
      indexFile = join(distDir, "index.html");
      scriptPath = join(workDir, "connect-entrypoint.sh");
      patchEntrypoint(ENTRYPOINT_SOURCE, scriptPath);
    });

    afterEach(() => {
      rmSync(workDir, { recursive: true, force: true });
    });

    it("rewrites the CSP registry origin when the operator overrides packageRegistryUrl", () => {
      // Image baked with the prod registry; operator points the studio at dev.
      writeFileSync(
        runtimeFile,
        JSON.stringify({
          schemaVersion: 2,
          packages: [],
          packageRegistryUrl: "https://registry.vetra.io",
          localPackage: null,
          connect: {},
        }),
        "utf-8",
      );
      writeFileSync(indexFile, indexHtml("https://registry.vetra.io"), "utf-8");

      const res = runEntrypoint({
        scriptPath,
        distDir,
        env: {
          PH_CONNECT_CONFIG_JSON: JSON.stringify({
            packageRegistryUrl: "https://registry.dev.vetra.io",
          }),
        },
      });
      expect(res.status).toBe(0);

      // Loader registry updated by the merge …
      expect(
        (readConfig(runtimeFile) as { packageRegistryUrl: string })
          .packageRegistryUrl,
      ).toBe("https://registry.dev.vetra.io");

      // … and the CSP now allows exactly that registry, prod origin gone.
      const html = readFileSync(indexFile, "utf-8");
      expect(html).toContain(
        scriptSrcFragment("https://registry.dev.vetra.io"),
      );
      // The prod origin is no longer allowed …
      expect(html).not.toContain(
        "&#39;unsafe-eval&#39; https://registry.vetra.io;",
      );
      // … and the other directives are untouched.
      expect(html).toContain("worker-src &#39;self&#39; blob:;");
      expect(html).toContain("object-src &#39;none&#39;;");
      expect(html).toContain("base-uri &#39;self&#39;;");
    });

    it("syncs the CSP to the baked registry when no operator override is given", () => {
      // No PH_CONNECT_CONFIG_JSON; CSP already matches — must stay correct and
      // not corrupt the directive (idempotent sync).
      writeFileSync(
        runtimeFile,
        JSON.stringify({
          schemaVersion: 2,
          packages: [],
          packageRegistryUrl: "https://registry.dev.vetra.io",
          localPackage: null,
          connect: {},
        }),
        "utf-8",
      );
      writeFileSync(
        indexFile,
        indexHtml("https://registry.dev.vetra.io"),
        "utf-8",
      );

      const res = runEntrypoint({ scriptPath, distDir, env: {} });
      expect(res.status).toBe(0);

      const html = readFileSync(indexFile, "utf-8");
      expect(html).toContain(
        scriptSrcFragment("https://registry.dev.vetra.io"),
      );
    });

    it("drops the CSP registry origin when the effective registry is null", () => {
      writeFileSync(
        runtimeFile,
        JSON.stringify({
          schemaVersion: 2,
          packages: [],
          packageRegistryUrl: null,
          localPackage: null,
          connect: {},
        }),
        "utf-8",
      );
      // Image baked with an origin the operator no longer wants allowed.
      writeFileSync(indexFile, indexHtml("https://registry.vetra.io"), "utf-8");

      const res = runEntrypoint({ scriptPath, distDir, env: {} });
      expect(res.status).toBe(0);

      const html = readFileSync(indexFile, "utf-8");
      // The registry origin is dropped; only the keyword allowances remain.
      expect(html).toContain(scriptSrcFragment(null));
      expect(html).not.toContain("https://");
    });
  },
);
