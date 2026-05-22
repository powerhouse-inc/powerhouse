// Integration test for `docker/connect-entrypoint.sh`'s env → file seeding.
// Verifies the operator-facing contract: env vars are translated into the
// runtime `powerhouse.config.json` only when the corresponding nested path is
// absent in the file (set-if-absent semantics).
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
  "docker/connect-entrypoint.sh env → file seeding",
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

    it("translates each env var into the right nested path on a clean file (scenarios 39, 41, 43)", () => {
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
          PH_CONNECT_RENOWN_URL: "https://renown.from-env",
          PH_CONNECT_RENOWN_NETWORK_ID: "eip155",
          PH_CONNECT_RENOWN_CHAIN_ID: "137",
          PH_CONNECT_BASE_PATH: "/sub",
          PH_CONNECT_LOG_LEVEL: "debug",
          PH_CONNECT_DEFAULT_DRIVES_URL: "https://a.example, https://b.example",
          PH_CONNECT_DRIVES_PRESERVE_STRATEGY: "preserve-all",
        },
      });
      expect(res.status).toBe(0);

      const config = readConfig(runtimeFile) as Record<string, Plain>;
      const connect = config.connect as Record<string, Plain>;
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

    it("does NOT overwrite a value the file already has (scenario 40, set-if-absent)", () => {
      seedFile({
        schemaVersion: 2,
        packages: [],
        localPackage: null,
        connect: {
          renown: { url: "https://kept.example", networkId: "eip155" },
          app: { basePath: "/kept", logLevel: "warn" },
        },
      });

      const res = runEntrypoint({
        scriptPath,
        distDir,
        env: {
          PH_CONNECT_RENOWN_URL: "https://hostile.from-env",
          PH_CONNECT_BASE_PATH: "/hostile",
          PH_CONNECT_LOG_LEVEL: "trace",
        },
      });
      expect(res.status).toBe(0);

      const config = readConfig(runtimeFile) as Record<string, Plain>;
      const connect = config.connect as Record<string, Plain>;
      // Pre-existing values preserved
      expect((connect.renown as Plain).url).toBe("https://kept.example");
      expect((connect.app as Plain).basePath).toBe("/kept");
      expect((connect.app as Plain).logLevel).toBe("warn");
    });

    it("leaves operator-meaningful fields untouched when no env vars are set (scenario 42)", () => {
      // Note: the entrypoint always stamps `connect.app.basePath` to the
      // value of `PH_CONNECT_BASE_PATH` (which defaults to "/"). That's a
      // no-op semantically — `DEFAULT_CONNECT_CONFIG.app.basePath` is also
      // "/". The assertion here is: operator-meaningful pre-existing fields
      // (renown.url etc.) survive untouched when no `PH_CONNECT_*` env was
      // set.
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

      const config = readConfig(runtimeFile) as Record<string, Plain>;
      expect(config.schemaVersion).toBe(2);
      expect(config.packages).toEqual([]);
      expect(config.localPackage).toBeNull();
      expect((config.connect as Plain).renown).toEqual({
        url: "https://baseline.example",
      });
      // Only the basePath-default got stamped (matches DEFAULT_CONNECT_CONFIG).
      expect(
        ((config.connect as Plain).app as Plain | undefined)?.basePath,
      ).toBe("/");
    });

    it("invert-bool env vars correctly flip the meaning when seeding absent fields", () => {
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
          // Disable env → allowAddDrive becomes false (inverted truth)
          PH_CONNECT_DISABLE_ADD_DRIVE: "true",
          // Disable env left at "false" → allowAddPublicDrives stays true
          PH_CONNECT_DISABLE_ADD_PUBLIC_DRIVES: "false",
        },
      });
      expect(res.status).toBe(0);

      const connect = (readConfig(runtimeFile) as { connect: Plain })
        .connect as Record<string, Plain>;
      expect((connect.drives as Plain).allowAddDrive).toBe(false);
      const sections = (connect.drives as Plain).sections as Record<
        string,
        Plain
      >;
      expect((sections.remote as Plain).allowAdd).toBe(true);
    });
  },
);
