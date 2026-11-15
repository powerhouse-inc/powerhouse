import { loadHost } from "@powerhousedao/host-core";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { tsConfigTemplate } from "templates";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { migrateSupersededConfig } from "./migrate-superseded-config.js";
import { migrate } from "./migrate.js";

const VERSION = "6.2.3-dev.73";
const CONFIG = "powerhouse.config.json";
const HTTPS = { keyPath: "certs/key.pem", certPath: "certs/cert.pem" };

const temporary: string[] = [];

beforeAll(() => {
  // Defined at build time by tsdown; migrate maps over it.
  Object.assign(globalThis, { WORKSPACE_PACKAGES: [] });
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of temporary.splice(0)) {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10 });
  }
});

function write(projectDir: string, path: string, contents: string) {
  const filePath = join(projectDir, path);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, contents);
}

const read = (projectDir: string, path: string) =>
  readFileSync(join(projectDir, path), "utf-8");

const readConfig = (projectDir: string) =>
  JSON.parse(read(projectDir, CONFIG)) as Record<string, unknown>;

const jsonText = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

/** Every file under `root` with its contents, by posix path. */
function tree(root: string): Record<string, string> {
  return Object.fromEntries(
    readdirSync(root, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry): [string, string] => {
        const path = join(entry.parentPath, entry.name);
        return [
          relative(root, path).replaceAll("\\", "/"),
          readFileSync(path, "utf8"),
        ];
      }),
  );
}

/** A folder holding only the powerhouse.config.json given. */
function configOnly(config: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "ph-migrate-superseded-"));
  temporary.push(dir);
  write(dir, CONFIG, jsonText(config));
  return dir;
}

/** A project of before the hosts/ folder, with the config given. */
function project(config: unknown): string {
  const dir = configOnly(config);
  write(
    dir,
    "package.json",
    jsonText({ name: "@acme/ledger", version: "1.0.0", type: "module" }),
  );
  write(dir, "tsconfig.json", tsConfigTemplate);
  return dir;
}

const lineFor = (lines: string[], key: string) =>
  lines.find((line) => line.startsWith(`${key}:`));

describe("migrateSupersededConfig when the run adds the hosts", () => {
  it("moves studio.host and studio.openBrowser to the connect runner", () => {
    const dir = configOnly({
      logLevel: "info",
      studio: { port: 3000, host: "0.0.0.0", openBrowser: false },
      reactor: { port: 4001 },
    });

    const { moved, lines } = migrateSupersededConfig(dir, true);

    expect(moved).toEqual({
      connectRunner: { host: "0.0.0.0", openBrowser: false },
    });
    // The other keys, their order and the formatting stay.
    expect(read(dir, CONFIG)).toBe(
      jsonText({
        logLevel: "info",
        studio: { port: 3000 },
        reactor: { port: 4001 },
      }),
    );
    expect(lineFor(lines, "studio.host")).toContain(
      "moved to runner.host in hosts/connect/host.js",
    );
    expect(lineFor(lines, "studio.openBrowser")).toContain(
      "moved to runner.openBrowser in hosts/connect/host.js",
    );
  });

  it.each([true, HTTPS])(
    "moves reactor.https %j to the switchboard's server config",
    (https) => {
      const dir = configOnly({ reactor: { port: 4001, https } });

      const { moved, lines } = migrateSupersededConfig(dir, true);

      expect(moved).toEqual({ switchboardHttps: https });
      expect(readConfig(dir)).toEqual({ reactor: { port: 4001 } });
      expect(lineFor(lines, "reactor.https")).toContain(
        "config.switchboard.server.https in hosts/switchboard/host.js",
      );
    },
  );

  it("removes an https key set to false, and says so", () => {
    const dir = configOnly({
      studio: { https: false },
      reactor: { https: false, port: 4001 },
    });

    const { moved, lines } = migrateSupersededConfig(dir, true);

    expect(moved).toEqual({});
    // A block the removal empties goes too.
    expect(readConfig(dir)).toEqual({ reactor: { port: 4001 } });
    expect(lineFor(lines, "studio.https")).toContain("removed (false)");
    expect(lineFor(lines, "reactor.https")).toContain("removed (false)");
  });

  it("keeps studio.https: true, which no host setting replaces", () => {
    const config = { studio: { port: 3000, https: true } };
    const dir = configOnly(config);

    const { moved, lines } = migrateSupersededConfig(dir, true);

    expect(moved).toEqual({});
    expect(read(dir, CONFIG)).toBe(jsonText(config));
    expect(lineFor(lines, "studio.https")).toContain("kept");
  });

  it("keeps the storage keys and names where they go", () => {
    const config = {
      reactor: { storage: { type: "postgres", postgresUrl: "postgres://db" } },
      switchboard: { database: { url: "postgres://db" } },
    };
    const dir = configOnly(config);

    const { moved, lines } = migrateSupersededConfig(dir, true);

    expect(moved).toEqual({});
    expect(read(dir, CONFIG)).toBe(jsonText(config));
    expect(lineFor(lines, "reactor.storage")).toContain(
      "reactor.backends.<name>.storage in hosts/switchboard/host.js",
    );
    expect(lineFor(lines, "switchboard.database.url")).toContain(
      "reactor.backends.<name>.storage.url in hosts/switchboard/host.js",
    );
  });

  it("keeps a value of a shape it can't carry", () => {
    const config = {
      studio: { host: 8080, openBrowser: "yes" },
      reactor: { https: { keyPath: "key.pem" } },
    };
    const dir = configOnly(config);

    const { moved, lines } = migrateSupersededConfig(dir, true);

    expect(moved).toEqual({});
    expect(read(dir, CONFIG)).toBe(jsonText(config));
    expect(lines).toHaveLength(3);
    for (const line of lines) expect(line).toContain("kept");
  });

  it("does nothing on a second run", () => {
    const dir = configOnly({
      studio: { port: 3000, host: "0.0.0.0" },
      reactor: { https: true },
    });
    migrateSupersededConfig(dir, true);
    const after = read(dir, CONFIG);

    expect(migrateSupersededConfig(dir, true)).toEqual({
      moved: {},
      lines: [],
    });
    expect(migrateSupersededConfig(dir, false)).toEqual({
      moved: {},
      lines: [],
    });
    expect(read(dir, CONFIG)).toBe(after);
  });

  it("leaves the Connect chrome keys in the config, and says who reads them", () => {
    const config = {
      connect: {
        drives: { allowAddDrive: false },
        home: { background: "none" },
      },
    };
    const dir = configOnly(config);

    const { lines } = migrateSupersededConfig(dir, true);

    expect(read(dir, CONFIG)).toBe(jsonText(config));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("connect.drives.allowAddDrive");
    expect(lines[0]).toContain("connect.home.background");
    expect(lines[0]).toContain("stay in powerhouse.config.json");
  });

  it("leaves a config it can't read, or a project without one, alone", () => {
    const dir = configOnly({});
    write(dir, CONFIG, "{ not json");
    expect(migrateSupersededConfig(dir, true)).toEqual({
      moved: {},
      lines: [],
    });
    expect(read(dir, CONFIG)).toBe("{ not json");

    rmSync(join(dir, CONFIG));
    expect(migrateSupersededConfig(dir, true)).toEqual({
      moved: {},
      lines: [],
    });
  });
});

describe("migrateSupersededConfig on a project with hosts of its own", () => {
  it("keeps every key and says what to set by hand", () => {
    const config = {
      studio: { host: "0.0.0.0", https: false, openBrowser: true },
      reactor: { https: HTTPS, storage: { type: "filesystem" } },
    };
    const dir = configOnly(config);

    const { moved, lines } = migrateSupersededConfig(dir, false);

    expect(moved).toEqual({});
    expect(read(dir, CONFIG)).toBe(jsonText(config));
    expect(lineFor(lines, "studio.host")).toContain(
      "Set runner.host in hosts/connect/host.js and remove the key.",
    );
    expect(lineFor(lines, "studio.openBrowser")).toContain(
      "Set runner.openBrowser in hosts/connect/host.js and remove the key.",
    );
    expect(lineFor(lines, "reactor.https")).toContain(
      "Set config.switchboard.server.https in hosts/switchboard/host.js and remove the key.",
    );
    expect(lineFor(lines, "studio.https")).toContain("can be removed");
    expect(lineFor(lines, "reactor.storage")).toContain("kept");
    expect(lines).toHaveLength(5);
  });

  it("names the generic plugin when the connect host leaves it out", () => {
    const dir = configOnly({ connect: { drives: { allowAddDrive: false } } });
    write(
      dir,
      "hosts/connect/host.js",
      'export default { runner: { module: "x", plugins: [] } };\n',
    );

    const { lines } = migrateSupersededConfig(dir, false);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("@powerhousedao/connect/plugins/generic");
    expect(lines[0]).toContain("allowAddDrive");
  });

  it("says nothing of the chrome keys when the connect host lists the plugin", () => {
    const dir = configOnly({ connect: { drives: { allowAddDrive: false } } });
    write(
      dir,
      "hosts/connect/host.js",
      'export default { runner: { plugins: ["@powerhousedao/connect/plugins/generic"] } };\n',
    );

    expect(migrateSupersededConfig(dir, false).lines).toEqual([]);
  });
});

describe("ph migrate on superseded config keys", { timeout: 90_000 }, () => {
  const config = {
    logLevel: "info",
    studio: { port: 3210, host: "0.0.0.0", https: false, openBrowser: false },
    reactor: { port: 4321, https: HTTPS },
    switchboard: { database: { url: "postgres://db" } },
  };
  const migrated = {
    logLevel: "info",
    studio: { port: 3210 },
    reactor: { port: 4321 },
    switchboard: { database: { url: "postgres://db" } },
  };

  it("writes the values into the hosts it adds, and takes the keys out", async () => {
    const dir = project(config);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await migrate(VERSION, dir, { skipInstall: true });

    expect(readConfig(dir)).toMatchObject(migrated);
    for (const key of ["host", "https", "openBrowser"]) {
      expect(readConfig(dir).studio, key).not.toHaveProperty(key);
    }
    expect(readConfig(dir).reactor).not.toHaveProperty("https");
    const connect = (await loadHost(dir, "connect")).host as {
      runner: Record<string, unknown>;
    };
    expect(connect.runner).toMatchObject({
      port: 3210,
      host: "0.0.0.0",
      openBrowser: false,
    });
    const switchboard = (await loadHost(dir, "switchboard")).host as {
      config: unknown;
    };
    expect(switchboard.config).toMatchObject({
      switchboard: { server: { https: HTTPS } },
    });
    const printed = log.mock.calls.map((call) => String(call[0]));
    expect(printed).toContain(
      "  studio.host: moved to runner.host in hosts/connect/host.js",
    );
    // The one it can't carry is named, not dropped.
    expect(
      printed.some((line) =>
        line.startsWith("  switchboard.database.url: kept"),
      ),
    ).toBe(true);

    // A second run changes nothing.
    const after = tree(dir);
    await migrate(VERSION, dir, { skipInstall: true });
    expect(tree(dir)).toEqual(after);
  });

  it("shows the move in a dry run, and writes nothing", async () => {
    const dir = project(config);
    const before = tree(dir);

    const result = await migrate(VERSION, dir, {
      skipInstall: true,
      dryRun: true,
    });

    expect(tree(dir)).toEqual(before);
    const changes = new Map(
      result.changes.map((change) => [
        relative(dir, change.path).replaceAll("\\", "/"),
        change,
      ]),
    );
    const changed = changes.get(CONFIG);
    expect(changed?.before).toBe(before[CONFIG]);
    expect(JSON.parse(changed?.after ?? "{}")).toMatchObject(migrated);
    expect(changed?.after).not.toContain("0.0.0.0");
    expect(changes.get("hosts/connect/host.js")?.after).toContain(
      'host: "0.0.0.0",',
    );
    expect(changes.get("hosts/connect/host.js")?.after).toContain(
      "openBrowser: false,",
    );
    expect(changes.get("hosts/switchboard/host.js")?.after).toContain(
      `https: ${JSON.stringify(HTTPS)}`,
    );
  });

  it("keeps the keys of a project with hosts of its own, and reports them", async () => {
    const dir = project(config);
    const own = "// the project's own host\nexport default {};\n";
    write(dir, "hosts/lab/host.js", own);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await migrate(VERSION, dir, { skipInstall: true });

    expect(readConfig(dir)).toMatchObject(config);
    expect(read(dir, "hosts/lab/host.js")).toBe(own);
    const printed = log.mock.calls.map((call) => String(call[0]));
    for (const key of [
      "studio.host",
      "studio.https",
      "studio.openBrowser",
      "reactor.https",
      "switchboard.database.url",
    ]) {
      expect(
        printed.some((line) => line.startsWith(`  ${key}: kept`)),
        key,
      ).toBe(true);
    }
  });
});
