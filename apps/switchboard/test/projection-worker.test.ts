import { describe, expect, it } from "vitest";
import {
  assertProjectionWorkerSupported,
  resolveProjectionWorkerOptions,
} from "../src/projection-worker.mjs";

describe("resolveProjectionWorkerOptions", () => {
  it("returns null when nothing is configured", () => {
    expect(resolveProjectionWorkerOptions(undefined, {})).toBeNull();
  });

  it("returns null when REACTOR_PROJECTION_WORKER is empty", () => {
    expect(
      resolveProjectionWorkerOptions(undefined, {
        REACTOR_PROJECTION_WORKER: "  ",
      }),
    ).toBeNull();
  });

  it.each(["1", "true", "on", "yes", " TRUE ", "On", "YES"])(
    "REACTOR_PROJECTION_WORKER=%j enables with the default pool",
    (raw) => {
      expect(
        resolveProjectionWorkerOptions(undefined, {
          REACTOR_PROJECTION_WORKER: raw,
        }),
      ).toEqual({ dbPoolSize: 8 });
    },
  );

  it.each(["0", "false", "off", "no", " FALSE ", "Off", "NO"])(
    "REACTOR_PROJECTION_WORKER=%j disables",
    (raw) => {
      expect(
        resolveProjectionWorkerOptions(undefined, {
          REACTOR_PROJECTION_WORKER: raw,
        }),
      ).toBeNull();
    },
  );

  it.each(["2", "enabled", "y", "1x"])(
    "rejects invalid REACTOR_PROJECTION_WORKER value %j",
    (raw) => {
      expect(() =>
        resolveProjectionWorkerOptions(undefined, {
          REACTOR_PROJECTION_WORKER: raw,
        }),
      ).toThrow(
        `REACTOR_PROJECTION_WORKER must be one of 1, true, on, yes, 0, false, off, no, got "${raw}"`,
      );
    },
  );

  it("programmatic enabled: true wins over an env off", () => {
    expect(
      resolveProjectionWorkerOptions(
        { enabled: true },
        { REACTOR_PROJECTION_WORKER: "0" },
      ),
    ).toEqual({ dbPoolSize: 8 });
  });

  it("programmatic enabled: false wins over an env on", () => {
    expect(
      resolveProjectionWorkerOptions(
        { enabled: false },
        { REACTOR_PROJECTION_WORKER: "1" },
      ),
    ).toBeNull();
  });

  it("programmatic enabled silences an invalid env token", () => {
    expect(
      resolveProjectionWorkerOptions(
        { enabled: false },
        { REACTOR_PROJECTION_WORKER: "maybe" },
      ),
    ).toBeNull();
  });

  it("does not parse the pool size while disabled", () => {
    expect(
      resolveProjectionWorkerOptions(undefined, {
        REACTOR_DB_POOL_SIZE_PROJECTION: "abc",
      }),
    ).toBeNull();
  });

  it("reads REACTOR_DB_POOL_SIZE_PROJECTION", () => {
    expect(
      resolveProjectionWorkerOptions(undefined, {
        REACTOR_PROJECTION_WORKER: "1",
        REACTOR_DB_POOL_SIZE_PROJECTION: "12",
      }),
    ).toEqual({ dbPoolSize: 12 });
  });

  it("defaults the pool size when the env var is an empty string", () => {
    expect(
      resolveProjectionWorkerOptions(undefined, {
        REACTOR_PROJECTION_WORKER: "1",
        REACTOR_DB_POOL_SIZE_PROJECTION: "",
      }),
    ).toEqual({ dbPoolSize: 8 });
  });

  it.each(["abc", "-1", "2.5", "4x"])(
    "rejects invalid REACTOR_DB_POOL_SIZE_PROJECTION value %j",
    (raw) => {
      expect(() =>
        resolveProjectionWorkerOptions(undefined, {
          REACTOR_PROJECTION_WORKER: "1",
          REACTOR_DB_POOL_SIZE_PROJECTION: raw,
        }),
      ).toThrow(
        `REACTOR_DB_POOL_SIZE_PROJECTION must be a non-negative integer, got "${raw}"`,
      );
    },
  );

  it("rejects 0 — the projection worker has no poolless state", () => {
    expect(() =>
      resolveProjectionWorkerOptions(undefined, {
        REACTOR_PROJECTION_WORKER: "1",
        REACTOR_DB_POOL_SIZE_PROJECTION: "0",
      }),
    ).toThrow(
      "REACTOR_DB_POOL_SIZE_PROJECTION must be at least 1; the projection worker cannot run without a pool",
    );
  });

  it("rejects a programmatic pool size of 0", () => {
    expect(() =>
      resolveProjectionWorkerOptions({ enabled: true, dbPoolSize: 0 }, {}),
    ).toThrow(/at least 1/);
  });

  it("prefers a programmatic pool size over env", () => {
    expect(
      resolveProjectionWorkerOptions(
        { enabled: true, dbPoolSize: 3 },
        { REACTOR_DB_POOL_SIZE_PROJECTION: "9" },
      ),
    ).toEqual({ dbPoolSize: 3 });
  });
});

describe("assertProjectionWorkerSupported", () => {
  const postgresUrl = "postgres://u:p@localhost:5432/reactor";

  it("throws in dev mode", () => {
    expect(() =>
      assertProjectionWorkerSupported({ dev: true, reactorDbUrl: postgresUrl }),
    ).toThrow(
      "The projection worker (REACTOR_PROJECTION_WORKER) is not supported in dev mode: Vite-loaded document models cannot cross a worker-thread boundary",
    );
  });

  it("throws without a reactor database URL", () => {
    expect(() =>
      assertProjectionWorkerSupported({ dev: false, reactorDbUrl: undefined }),
    ).toThrow(
      "The projection worker (REACTOR_PROJECTION_WORKER) requires a Postgres reactor database — set PH_REACTOR_DATABASE_URL or PH_SWITCHBOARD_DATABASE_URL. PGlite cannot be shared across worker threads.",
    );
  });

  it("throws for a PGlite path", () => {
    expect(() =>
      assertProjectionWorkerSupported({
        dev: false,
        reactorDbUrl: "./.ph/reactor-storage",
      }),
    ).toThrow(/requires a Postgres reactor database/);
  });

  it.each(["postgres://u:p@h/db", "postgresql://u:p@h/db"])(
    "passes for %s",
    (url) => {
      expect(() =>
        assertProjectionWorkerSupported({ dev: false, reactorDbUrl: url }),
      ).not.toThrow();
    },
  );
});
