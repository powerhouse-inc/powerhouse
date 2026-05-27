import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runConnectConfig } from "../src/services/connect-config.js";
import type { ConnectConfigArgs } from "../src/types.js";

function mk(partial: Partial<ConnectConfigArgs>): ConnectConfigArgs {
  return {
    get: undefined,
    distDir: undefined,
    json: undefined,
    renownUrl: undefined,
    renownNetworkId: undefined,
    renownChainId: undefined,
    allowAddDrive: undefined,
    externalPackages: undefined,
    remoteDrivesEnabled: undefined,
    remoteDrivesAllowAdd: undefined,
    remoteDrivesAllowDelete: undefined,
    localDrivesEnabled: undefined,
    localDrivesAllowAdd: undefined,
    localDrivesAllowDelete: undefined,
    packagesRegistry: undefined,
    appName: undefined,
    homeBackground: undefined,
    sentryDsn: undefined,
    sentryEnv: undefined,
    sentryTracingEnabled: undefined,
    keyPositional: undefined,
    valuePositional: undefined,
    connectBasePath: "/",
    logLevel: "info",
    defaultDrivesUrl: "",
    drivesPreserveStrategy: "preserve-by-url-and-detach",
    ...partial,
  } as ConnectConfigArgs;
}

const SOURCE_FILE = "powerhouse.config.json";
const DEFAULT_DIST = ".ph/connect-build/dist";

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
}

describe("ph connect config", () => {
  let tmpDir: string;
  let originalArgv: string[];
  let stdoutChunks: string[];

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "ph-connect-config-test-"));
    originalArgv = process.argv;
    process.argv = ["node", "ph", "connect", "config"];
    vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
    stdoutChunks = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      stdoutChunks.push(String(chunk));
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.argv = originalArgv;
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeSource(content: Record<string, unknown>): void {
    writeFileSync(
      join(tmpDir, SOURCE_FILE),
      JSON.stringify(content, null, 2),
      "utf-8",
    );
  }

  function writeDist(content: Record<string, unknown>): void {
    const distDir = join(tmpDir, DEFAULT_DIST);
    mkdirSync(distDir, { recursive: true });
    writeFileSync(
      join(distDir, SOURCE_FILE),
      JSON.stringify(content, null, 2),
      "utf-8",
    );
  }

  // ---------------- List mode ----------------

  describe("list mode (scenario 14)", () => {
    it("prints the effective connect.* block (defaults + source)", async () => {
      writeSource({ connect: { branding: { appName: "List Test" } } });
      await runConnectConfig(mk({}));
      const printed = JSON.parse(stdoutChunks.join("")) as Record<
        string,
        Record<string, unknown>
      >;
      // Source override visible
      expect(printed.branding.appName).toBe("List Test");
      // Default fields still present
      expect(printed.app).toBeDefined();
      expect(printed.renown).toBeDefined();
      expect(printed.drives).toBeDefined();
    });

    it("works even when no source file exists (full defaults)", async () => {
      await runConnectConfig(mk({}));
      const printed = JSON.parse(stdoutChunks.join("")) as Record<
        string,
        Record<string, unknown>
      >;
      expect(printed.branding).toBeDefined();
      expect(printed.app).toBeDefined();
    });
  });

  // ---------------- Get mode ----------------

  describe("get mode (scenarios 15, 16)", () => {
    it("returns a connect.* leaf value via dotted path", async () => {
      writeSource({ connect: { renown: { url: "https://gotten.example" } } });
      await runConnectConfig(mk({ get: "connect.renown.url" }));
      expect(stdoutChunks.join("")).toBe(
        `${JSON.stringify("https://gotten.example", null, 2)}\n`,
      );
    });

    it("accepts paths without the leading `connect.` prefix", async () => {
      writeSource({ connect: { renown: { url: "https://gotten.example" } } });
      await runConnectConfig(mk({ get: "renown.url" }));
      expect(stdoutChunks.join("")).toBe(
        `${JSON.stringify("https://gotten.example", null, 2)}\n`,
      );
    });

    it("returns top-level packageRegistryUrl", async () => {
      writeSource({
        packageRegistryUrl: "https://registry.example",
        connect: {},
      });
      await runConnectConfig(mk({ get: "packageRegistryUrl" }));
      expect(stdoutChunks.join("")).toBe(
        `${JSON.stringify("https://registry.example", null, 2)}\n`,
      );
    });

    it("throws a clear error for empty key", async () => {
      writeSource({ connect: {} });
      await expect(runConnectConfig(mk({ get: "" }))).rejects.toThrow(
        /key cannot be empty/,
      );
    });

    it("throws a clear error for an unknown path", async () => {
      writeSource({ connect: {} });
      await expect(
        runConnectConfig(mk({ get: "no.such.path" })),
      ).rejects.toThrow(/no value at key "no\.such\.path"/);
    });
  });

  // ---------------- Set mode ----------------

  describe("set mode — single field (scenario 17)", () => {
    it("dual-writes a connect.* field into source and dist", async () => {
      writeSource({ connect: { branding: { appName: "Before" } } });
      writeDist({ schemaVersion: 2, packages: [], connect: {} });

      await runConnectConfig(mk({ renownUrl: "https://written.example" }));

      const source = readJson(join(tmpDir, SOURCE_FILE));
      expect(
        (source.connect as Record<string, Record<string, unknown>>).renown.url,
      ).toBe("https://written.example");
      // Pre-existing source fields preserved
      expect(
        (source.connect as Record<string, Record<string, unknown>>).branding
          .appName,
      ).toBe("Before");

      const dist = readJson(join(tmpDir, DEFAULT_DIST, SOURCE_FILE));
      expect(
        (dist.connect as Record<string, Record<string, unknown>>).renown.url,
      ).toBe("https://written.example");
    });

    it("source-only write succeeds when no dist file exists (scenario 21)", async () => {
      writeSource({ connect: {} });
      await runConnectConfig(mk({ renownUrl: "https://no-dist" }));

      const source = readJson(join(tmpDir, SOURCE_FILE));
      expect(
        (source.connect as Record<string, Record<string, unknown>>).renown.url,
      ).toBe("https://no-dist");

      expect(existsSync(join(tmpDir, DEFAULT_DIST, SOURCE_FILE))).toBe(false);
    });
  });

  describe("set mode — top-level packageRegistryUrl (scenario 18)", () => {
    it("writes packageRegistryUrl at the top level on both files", async () => {
      writeSource({ connect: {} });
      writeDist({ schemaVersion: 2, packages: [], connect: {} });

      await runConnectConfig(mk({ packagesRegistry: "https://reg.example" }));

      const source = readJson(join(tmpDir, SOURCE_FILE));
      expect(source.packageRegistryUrl).toBe("https://reg.example");
      expect(
        (source.connect as Record<string, unknown>).packageRegistryUrl,
      ).toBeUndefined();

      const dist = readJson(join(tmpDir, DEFAULT_DIST, SOURCE_FILE));
      expect(dist.packageRegistryUrl).toBe("https://reg.example");
    });
  });

  // ---------------- JSON bulk-set mode ----------------

  describe("bulk-set mode --json (scenarios 19, 20)", () => {
    it("deep-merges a connect.* JSON patch into both files", async () => {
      writeSource({ connect: { branding: { appName: "Keep" } } });
      writeDist({ schemaVersion: 2, packages: [], connect: {} });

      await runConnectConfig(
        mk({
          json: JSON.stringify({
            renown: { url: "https://json-set" },
          }),
        }),
      );

      const source = readJson(join(tmpDir, SOURCE_FILE));
      const sourceConnect = source.connect as Record<
        string,
        Record<string, unknown>
      >;
      // Patched leaf landed
      expect(sourceConnect.renown.url).toBe("https://json-set");
      // Pre-existing siblings preserved
      expect(sourceConnect.branding.appName).toBe("Keep");

      const dist = readJson(join(tmpDir, DEFAULT_DIST, SOURCE_FILE));
      expect(
        (dist.connect as Record<string, Record<string, unknown>>).renown.url,
      ).toBe("https://json-set");
    });

    it("routes top-level packageRegistryUrl in --json to the top level and strips it from connect.*", async () => {
      writeSource({ connect: {} });

      await runConnectConfig(
        mk({
          json: JSON.stringify({
            packageRegistryUrl: "https://json-reg",
            renown: { url: "https://json-renown" },
          }),
        }),
      );

      const source = readJson(join(tmpDir, SOURCE_FILE));
      expect(source.packageRegistryUrl).toBe("https://json-reg");
      const sourceConnect = source.connect as Record<
        string,
        Record<string, unknown>
      >;
      expect(sourceConnect.renown.url).toBe("https://json-renown");
      // Must NOT have leaked into connect.* block
      expect(sourceConnect.packageRegistryUrl).toBeUndefined();
    });
  });

  // ---------------- Error cases ----------------

  describe("error cases (scenarios 22, 23)", () => {
    it("rejects combining --get with --json", async () => {
      writeSource({ connect: {} });
      await expect(
        runConnectConfig(
          mk({ get: "renown.url", json: '{"renown":{"url":"x"}}' }),
        ),
      ).rejects.toThrow(/mutually exclusive/);
    });

    it("rejects combining --get with a field flag", async () => {
      writeSource({ connect: {} });
      await expect(
        runConnectConfig(mk({ get: "renown.url", renownUrl: "https://x" })),
      ).rejects.toThrow(/mutually exclusive/);
    });

    it("rejects combining --json with a field flag", async () => {
      writeSource({ connect: {} });
      await expect(
        runConnectConfig(
          mk({ json: '{"renown":{"url":"x"}}', renownUrl: "https://y" }),
        ),
      ).rejects.toThrow(/mutually exclusive/);
    });

    it("rejects empty --json patch as nothing-to-set", async () => {
      writeSource({ connect: {} });
      await expect(runConnectConfig(mk({ json: "{}" }))).rejects.toThrow(
        /nothing to set/,
      );
    });
  });

  // ---------------- --base rejection ----------------

  describe("--base is rejected (build-time-only field)", () => {
    it("throws with an actionable message when --base is explicitly passed", async () => {
      writeSource({ connect: {} });
      process.argv = ["node", "ph", "connect", "config", "--base", "/foo"];
      await expect(
        runConnectConfig(mk({ connectBasePath: "/foo" })),
      ).rejects.toThrow(/--base is a build-time field/);
    });

    it("does NOT trigger when --base was not passed (cmd-ts default present in args)", async () => {
      writeSource({ connect: {} });
      // process.argv has no --base; the default "/" in args must not trigger
      // the rejection.
      await runConnectConfig(mk({ renownUrl: "https://ok" }));
      const source = readJson(join(tmpDir, SOURCE_FILE));
      expect(
        (
          (source.connect as Record<string, unknown>).renown as Record<
            string,
            unknown
          >
        ).url,
      ).toBe("https://ok");
    });
  });

  // ---------------- --sentry-* writes ----------------

  describe("sentry overrides", () => {
    it("writes connect.sentry.dsn / env / tracing into both files", async () => {
      writeSource({ connect: {} });
      writeDist({ schemaVersion: 2, packages: [], connect: {} });

      await runConnectConfig(
        mk({
          sentryDsn: "https://example@sentry.io/1",
          sentryEnv: "staging",
          sentryTracingEnabled: true,
        }),
      );

      const source = readJson(join(tmpDir, SOURCE_FILE));
      const sentry = (source.connect as Record<string, Record<string, unknown>>)
        .sentry;
      expect(sentry.dsn).toBe("https://example@sentry.io/1");
      expect(sentry.env).toBe("staging");
      expect(sentry.tracing).toBe(true);

      const dist = readJson(join(tmpDir, DEFAULT_DIST, SOURCE_FILE));
      const distSentry = (
        dist.connect as Record<string, Record<string, unknown>>
      ).sentry;
      expect(distSentry.dsn).toBe("https://example@sentry.io/1");
    });

    it("--sentry-dsn '' sets the DSN to null (disables Sentry)", async () => {
      writeSource({
        connect: { sentry: { dsn: "https://existing", env: "prod" } },
      });

      await runConnectConfig(mk({ sentryDsn: "" }));

      const source = readJson(join(tmpDir, SOURCE_FILE));
      const sentry = (source.connect as Record<string, Record<string, unknown>>)
        .sentry;
      expect(sentry.dsn).toBeNull();
      // Sibling preserved
      expect(sentry.env).toBe("prod");
    });
  });

  describe("positional <key> / <key> <value>", () => {
    it("positional <key> alone reads the effective value (get mode)", async () => {
      writeSource({
        connect: { renown: { url: "https://renown.staging" } },
      });

      await runConnectConfig(mk({ keyPositional: "connect.renown.url" }));

      expect(stdoutChunks.join("")).toContain("https://renown.staging");
    });

    it("positional <key> on packageRegistryUrl reads the top-level field", async () => {
      writeSource({
        packageRegistryUrl: "https://my.registry",
        connect: {},
      });

      await runConnectConfig(mk({ keyPositional: "packageRegistryUrl" }));

      expect(stdoutChunks.join("")).toContain("https://my.registry");
    });

    it("positional <key> with empty key throws", async () => {
      writeSource({ connect: {} });
      await expect(runConnectConfig(mk({ keyPositional: "" }))).rejects.toThrow(
        /key cannot be empty/,
      );
    });

    it("positional <key> <value> sets a string field and dual-writes", async () => {
      writeSource({ connect: {} });
      writeDist({ connect: {} });

      await runConnectConfig(
        mk({
          keyPositional: "connect.renown.url",
          valuePositional: "https://renown.staging",
        }),
      );

      const source = readJson(join(tmpDir, SOURCE_FILE));
      expect(
        (source.connect as Record<string, Record<string, unknown>>).renown.url,
      ).toBe("https://renown.staging");
      const dist = readJson(join(tmpDir, DEFAULT_DIST, SOURCE_FILE));
      expect(
        (dist.connect as Record<string, Record<string, unknown>>).renown.url,
      ).toBe("https://renown.staging");
    });

    it("positional <key> <value> coerces a boolean", async () => {
      writeSource({ connect: {} });

      await runConnectConfig(
        mk({
          keyPositional: "connect.drives.allowAddDrive",
          valuePositional: "false",
        }),
      );

      const source = readJson(join(tmpDir, SOURCE_FILE));
      expect(
        (source.connect as Record<string, Record<string, unknown>>).drives
          .allowAddDrive,
      ).toBe(false);
    });

    it("positional <key> <value> coerces a number", async () => {
      writeSource({ connect: {} });

      await runConnectConfig(
        mk({
          keyPositional: "connect.renown.chainId",
          valuePositional: "137",
        }),
      );

      const source = readJson(join(tmpDir, SOURCE_FILE));
      expect(
        (source.connect as Record<string, Record<string, unknown>>).renown
          .chainId,
      ).toBe(137);
    });

    it("positional <key> <value> validates against the schema (rejects wrong type)", async () => {
      writeSource({ connect: {} });
      await expect(
        runConnectConfig(
          mk({
            keyPositional: "connect.renown.chainId",
            valuePositional: "abc",
          }),
        ),
      ).rejects.toThrow(/validation failed/);
    });

    it("positional <key> <value> rejects an unknown dotted path", async () => {
      writeSource({ connect: {} });
      await expect(
        runConnectConfig(
          mk({
            keyPositional: "connect.doesNotExist",
            valuePositional: "x",
          }),
        ),
      ).rejects.toThrow(/validation failed/);
    });

    it("positional <key> <value> writes packageRegistryUrl at the top level", async () => {
      writeSource({ connect: {} });

      await runConnectConfig(
        mk({
          keyPositional: "packageRegistryUrl",
          valuePositional: "https://my.registry",
        }),
      );

      const source = readJson(join(tmpDir, SOURCE_FILE));
      expect(source.packageRegistryUrl).toBe("https://my.registry");
    });

    it("mutex: positional + --get throws", async () => {
      writeSource({ connect: {} });
      await expect(
        runConnectConfig(
          mk({
            keyPositional: "connect.renown.url",
            get: "connect.renown.networkId",
          }),
        ),
      ).rejects.toThrow(/mutually exclusive/);
    });

    it("mutex: positional + --json throws", async () => {
      writeSource({ connect: {} });
      await expect(
        runConnectConfig(
          mk({
            keyPositional: "connect.renown.url",
            valuePositional: "https://x",
            json: '{"renown":{"url":"https://y"}}',
          }),
        ),
      ).rejects.toThrow(/mutually exclusive/);
    });

    it("mutex: positional + field flag throws", async () => {
      writeSource({ connect: {} });
      await expect(
        runConnectConfig(
          mk({
            keyPositional: "connect.renown.url",
            valuePositional: "https://x",
            renownUrl: "https://y",
          }),
        ),
      ).rejects.toThrow(/mutually exclusive/);
    });
  });
});
