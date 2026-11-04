import { createRequire } from "node:module";
import type { Client as PgClient } from "pg";
import { describe, expect, it } from "vitest";
import {
  databasePrefix,
  databaseUrl,
  machineTag,
  ownerOf,
  postgresServer,
} from "./databases.ts";

describe("databasePrefix", () => {
  it("takes the url's database, or ph_monitor", () => {
    expect(databasePrefix("postgres://u:p@h:5433/fix_g1")).toBe("fix_g1");
    expect(databasePrefix("postgresql://h")).toBe("ph_monitor");
  });

  it("refuses what can't name a database", () => {
    expect(() => databasePrefix("not a url")).toThrow(/not a URL/);
    expect(() => databasePrefix("mysql://h/db")).toThrow(/postgres:\/\//);
    expect(() => databasePrefix("postgres://h/Fix")).toThrow(/lowercase/);
    expect(() => databasePrefix(`postgres://h/${"a".repeat(36)}`)).toThrow(
      /at most 35/,
    );
  });
});

describe("databaseUrl", () => {
  it("swaps the database, keeping the rest", () => {
    expect(databaseUrl("postgres://u:p@h:5433/fix?sslmode=disable", "x")).toBe(
      "postgres://u:p@h:5433/x?sslmode=disable",
    );
  });
});

describe("ownerOf", () => {
  it("reads the pid from a name this prefix made on this machine", () => {
    const here = machineTag("here");
    expect(here).toMatch(/^[0-9a-f]{6}$/);
    expect(machineTag("there")).not.toBe(here);
    expect(ownerOf("fix", `fix_${here}_123_0123456789ab`, here)).toBe(123);
    expect(
      ownerOf("fix", `fix_${machineTag("there")}_123_0123456789ab`, here),
    ).toBeUndefined();
    expect(ownerOf("fix", `fix_${here}_123_0123`, here)).toBeUndefined();
    expect(ownerOf("fix", "fix_123_0123456789ab", here)).toBeUndefined();
  });
});

// A real server, e.g. postgres://postgres:postgres@localhost:5433/fix_g1_admin
const testUrl = process.env.PH_MONITOR_TEST_PG_URL;

describe.skipIf(!testUrl)("postgresServer", () => {
  const exists = async (name: string) => {
    const Client = createRequire(import.meta.url)(
      "pg/lib/client",
    ) as typeof PgClient;
    const client = new Client({ connectionString: testUrl });
    await client.connect();
    try {
      const { rowCount } = await client.query(
        "SELECT 1 FROM pg_database WHERE datname = $1",
        [name],
      );
      return rowCount === 1;
    } finally {
      await client.end();
    }
  };

  it("makes distinct databases, drops them, and sweeps a gone monitor's", async () => {
    const url = testUrl as string;
    // No process has this pid.
    const gone = postgresServer(url, 2_147_483_000);
    const left = await gone.create();
    const server = postgresServer(url);
    const [a, b] = await Promise.all([server.create(), server.create()]);
    expect(a.name).not.toBe(b.name);
    expect(a.url).toBe(databaseUrl(url, a.name));
    expect(await exists(a.name)).toBe(true);
    expect(await exists(left.name)).toBe(false);
    await server.drop(a.name);
    await server.drop(b.name);
    expect(await exists(a.name)).toBe(false);
    expect(await exists(b.name)).toBe(false);
  });
});
