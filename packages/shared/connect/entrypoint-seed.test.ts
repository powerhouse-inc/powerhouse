// Integration test for `docker/connect-entrypoint.sh`'s env → file seeding.
// Verifies the operator-facing contract: the entrypoint reads a single
// `PH_CONNECT_CONFIG_JSON` env var, deep-merges it into the dist
// `powerhouse.config.json`, and only writes paths that are currently
// null/missing in the file (set-if-absent semantics).
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
      expect((connect.app as Plain).basePath).toBe("/sub");
      expect((connect.app as Plain).logLevel).toBe("debug");
      expect((connect.drives as Plain).preserveStrategy).toBe("preserve-all");
      expect((connect.drives as Plain).defaultDrives).toEqual([
        { url: "https://a.example", name: null, icon: null },
        { url: "https://b.example", name: null, icon: null },
      ]);
    });

    it("does NOT overwrite values the file already has (set-if-absent)", () => {
      seedFile({
        schemaVersion: 2,
        packages: [],
        localPackage: null,
        connect: {
          renown: { url: "https://kept.example", networkId: "eip155" },
          app: { basePath: "/kept", logLevel: "warn" },
        },
      });

      const payload = {
        connect: {
          renown: { url: "https://hostile.example", chainId: 137 },
          app: { basePath: "/hostile", logLevel: "trace" },
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
      // Pre-existing values preserved
      expect((connect.renown as Plain).url).toBe("https://kept.example");
      expect((connect.renown as Plain).networkId).toBe("eip155");
      expect((connect.app as Plain).basePath).toBe("/kept");
      expect((connect.app as Plain).logLevel).toBe("warn");
      // Net-new leaves get filled in
      expect((connect.renown as Plain).chainId).toBe(137);
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

    it("fills in nested-object gaps without clobbering sibling leaves", () => {
      // Sections.remote.enabled pre-set; .allowAdd and .allowDelete absent.
      // The operator JSON sets all three; only the missing two are written.
      seedFile({
        schemaVersion: 2,
        packages: [],
        localPackage: null,
        connect: {
          drives: {
            sections: {
              remote: { enabled: false },
            },
          },
        },
      });

      const payload = {
        connect: {
          drives: {
            sections: {
              remote: { enabled: true, allowAdd: false, allowDelete: false },
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
      // Pre-existing flag kept
      expect(remote.enabled).toBe(false);
      // Net-new sibling leaves filled
      expect(remote.allowAdd).toBe(false);
      expect(remote.allowDelete).toBe(false);
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
