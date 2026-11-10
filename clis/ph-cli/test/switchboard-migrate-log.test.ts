import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("pg", () => ({
  Pool: vi.fn(function () {
    return {};
  }),
}));
vi.mock("kysely", () => ({
  Kysely: vi.fn(function () {
    return { destroy: vi.fn(() => Promise.resolve()) };
  }),
  PostgresDialect: vi.fn(),
}));
vi.mock("@powerhousedao/reactor", () => ({
  REACTOR_SCHEMA: "reactor",
  runMigrations: vi.fn(() =>
    Promise.resolve({ success: true, migrationsExecuted: ["001_init"] }),
  ),
  getMigrationStatus: vi.fn(() =>
    Promise.resolve([{ name: "001_init", executedAt: new Date(0) }]),
  ),
}));

import { runSwitchboardMigrations } from "../src/services/switchboard-migrate.js";

const PASSWORD = "s3cr3t-P@ss";
const URL = `postgresql://tenant_user:${encodeURIComponent(PASSWORD)}@db.internal:5432/tenant_db`;

describe("runSwitchboardMigrations output", () => {
  let printed: string[];

  beforeEach(() => {
    printed = [];
    const capture = (...args: unknown[]) => {
      printed.push(args.map(String).join(" "));
    };
    vi.spyOn(console, "log").mockImplementation(capture);
    vi.spyOn(console, "error").mockImplementation(capture);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ["migrate", false],
    ["status", true],
  ])(
    "never prints the database URL or password (%s)",
    async (_, statusOnly) => {
      await runSwitchboardMigrations({ dbPath: URL, statusOnly });

      const out = printed.join("\n");
      expect(out).not.toContain(URL);
      expect(out).not.toContain(PASSWORD);
      expect(out).not.toContain(encodeURIComponent(PASSWORD));
      expect(out).not.toContain("db.internal");
    },
  );
});
