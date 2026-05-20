import { describe, expect, it } from "vitest";
import {
  isPostgresUrl,
  resolveResetPaths,
} from "../src/services/switchboard-reset.js";
import {
  isUnrecoverableDbError,
} from "../src/utils/db-error-hint.js";

describe("isPostgresUrl", () => {
  it("detects postgres:// and postgresql://", () => {
    expect(isPostgresUrl("postgres://u:p@h/db")).toBe(true);
    expect(isPostgresUrl("postgresql://u:p@h/db")).toBe(true);
  });

  it("rejects non-postgres strings", () => {
    expect(isPostgresUrl("./.ph/reactor-storage")).toBe(false);
    expect(isPostgresUrl("sqlite:///tmp/x.db")).toBe(false);
  });
});

describe("resolveResetPaths", () => {
  it("returns default PGlite directories when no env or dbPath is set", () => {
    const paths = resolveResetPaths({}, {});
    expect(paths.reactorDir).toBe("./.ph/reactor-storage");
    expect(paths.readModelDir).toBe(".ph/read-storage");
    expect(paths.postgresUrl).toBeNull();
  });

  it("flags a configured Postgres URL via dbPath", () => {
    const paths = resolveResetPaths(
      { dbPath: "postgres://u:p@host:5432/db" },
      {},
    );
    expect(paths.reactorDir).toBeNull();
    expect(paths.readModelDir).toBeNull();
    expect(paths.postgresUrl).toBe("postgres://u:p@host:5432/db");
  });

  it("flags a configured Postgres URL via PH_REACTOR_DATABASE_URL", () => {
    const paths = resolveResetPaths(
      {},
      { PH_REACTOR_DATABASE_URL: "postgresql://x/y" } as NodeJS.ProcessEnv,
    );
    expect(paths.reactorDir).toBeNull();
    expect(paths.postgresUrl).toBe("postgresql://x/y");
  });

  it("honors a custom dbPath that is a local directory", () => {
    const paths = resolveResetPaths(
      { dbPath: "/tmp/custom-pglite" },
      {},
    );
    expect(paths.reactorDir).toBe("/tmp/custom-pglite");
    expect(paths.readModelDir).toBe("/tmp/custom-pglite");
    expect(paths.postgresUrl).toBeNull();
  });
});

describe("isUnrecoverableDbError", () => {
  it("matches the reactor-builder migration failure message", () => {
    const err = new Error(
      "Database migration failed: relation \"operations\" already exists",
    );
    expect(isUnrecoverableDbError(err)).toBe(true);
  });

  it("matches a wrapped cause", () => {
    const inner = new Error("Unsupported PGLite data dir at ./.ph/x: PG_VERSION=16");
    const outer = new Error("App crashed", { cause: inner });
    expect(isUnrecoverableDbError(outer)).toBe(true);
  });

  it("ignores unrelated errors", () => {
    expect(isUnrecoverableDbError(new Error("EADDRINUSE"))).toBe(false);
    expect(isUnrecoverableDbError("oops")).toBe(false);
  });
});
