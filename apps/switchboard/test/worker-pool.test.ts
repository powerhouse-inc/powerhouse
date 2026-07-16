import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import { reactorDriveDocumentModelModule } from "@powerhousedao/reactor-drive";
import { documentModelDocumentModelModule, type ILogger } from "document-model";
import { describe, expect, it, vi } from "vitest";
import {
  autoWorkerCount,
  buildWorkerDbConfig,
  modelKey,
  resolveWorkerModelSpecs,
  resolveWorkerPoolOptions,
} from "../src/worker-pool.mjs";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";

function stubLogger(): ILogger {
  return {
    verbose: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as ILogger;
}

describe("resolveWorkerPoolOptions", () => {
  it("returns null when nothing is configured", () => {
    expect(resolveWorkerPoolOptions(undefined, {})).toBeNull();
  });

  it("returns null when REACTOR_WORKERS is 0", () => {
    expect(
      resolveWorkerPoolOptions(undefined, { REACTOR_WORKERS: "0" }),
    ).toBeNull();
  });

  it("reads REACTOR_WORKERS and applies defaults", () => {
    const resolved = resolveWorkerPoolOptions(undefined, {
      REACTOR_WORKERS: "4",
    });
    expect(resolved).toEqual({
      numWorkers: 4,
      mode: "explicit",
      dbPoolSizePerWorker: 2,
      acquireTimeoutMs: 5000,
    });
  });

  it("reads pool tuning env vars", () => {
    const resolved = resolveWorkerPoolOptions(undefined, {
      REACTOR_WORKERS: "2",
      REACTOR_DB_POOL_SIZE_WORKER: "5",
      REACTOR_DB_ACQUIRE_TIMEOUT_MS: "1000",
    });
    expect(resolved).toEqual({
      numWorkers: 2,
      mode: "explicit",
      dbPoolSizePerWorker: 5,
      acquireTimeoutMs: 1000,
    });
  });

  it("prefers programmatic options over env", () => {
    const resolved = resolveWorkerPoolOptions(
      { numWorkers: 3, dbPoolSizePerWorker: 4 },
      { REACTOR_WORKERS: "8", REACTOR_DB_POOL_SIZE_WORKER: "9" },
    );
    expect(resolved).toEqual({
      numWorkers: 3,
      mode: "explicit",
      dbPoolSizePerWorker: 4,
      acquireTimeoutMs: 5000,
    });
  });

  it("programmatic zero disables the pool even when env is set", () => {
    expect(
      resolveWorkerPoolOptions({ numWorkers: 0 }, { REACTOR_WORKERS: "4" }),
    ).toBeNull();
  });

  it.each(["abc", "-1", "2.5", "4x"])(
    "rejects invalid REACTOR_WORKERS value %s",
    (raw) => {
      expect(() =>
        resolveWorkerPoolOptions(undefined, { REACTOR_WORKERS: raw }),
      ).toThrow(/REACTOR_WORKERS/);
    },
  );

  it.each([
    [16, 8],
    [10, 8],
    [8, 6],
    [4, 2],
    [3, 1],
    [2, 1],
    [1, 1],
  ])(
    "REACTOR_WORKERS=auto with %d cores sizes the pool to %d",
    (cores, expected) => {
      const resolved = resolveWorkerPoolOptions(
        undefined,
        { REACTOR_WORKERS: "auto" },
        cores,
      );
      expect(resolved).toEqual({
        numWorkers: expected,
        mode: "auto",
        dbPoolSizePerWorker: 2,
        acquireTimeoutMs: 5000,
      });
    },
  );

  it("accepts AUTO case-insensitively and with whitespace", () => {
    const resolved = resolveWorkerPoolOptions(
      undefined,
      { REACTOR_WORKERS: " AUTO " },
      8,
    );
    expect(resolved?.numWorkers).toBe(6);
    expect(resolved?.mode).toBe("auto");
  });

  it("accepts programmatic auto and prefers it over env", () => {
    const resolved = resolveWorkerPoolOptions(
      { numWorkers: "auto" },
      { REACTOR_WORKERS: "2" },
      4,
    );
    expect(resolved).toEqual({
      numWorkers: 2,
      mode: "auto",
      dbPoolSizePerWorker: 2,
      acquireTimeoutMs: 5000,
    });
  });

  it("uses the real core count when none is injected", () => {
    const resolved = resolveWorkerPoolOptions(undefined, {
      REACTOR_WORKERS: "auto",
    });
    expect(resolved?.mode).toBe("auto");
    expect(resolved?.numWorkers).toBeGreaterThanOrEqual(1);
    expect(resolved?.numWorkers).toBeLessThanOrEqual(8);
  });
});

describe("autoWorkerCount", () => {
  it("never returns less than 1 or more than the cap", () => {
    expect(autoWorkerCount(1)).toBe(1);
    expect(autoWorkerCount(64)).toBe(8);
  });
});

describe("buildWorkerDbConfig", () => {
  const pool = { dbPoolSizePerWorker: 2, acquireTimeoutMs: 5000 };

  it("parses a full postgres URL", () => {
    const config = buildWorkerDbConfig(
      "postgresql://reactor:s3cret@db.example.com:5444/reactor_db",
      pool,
    );
    expect(config).toEqual({
      host: "db.example.com",
      port: 5444,
      database: "reactor_db",
      user: "reactor",
      password: "s3cret",
      ssl: false,
      applicationName: "switchboard-worker",
      poolSize: 2,
      connectionTimeoutMillis: 5000,
    });
  });

  it("defaults the port to 5432 and decodes credentials", () => {
    const config = buildWorkerDbConfig(
      "postgres://re%40ctor:p%23ss@localhost/reactor",
      pool,
    );
    expect(config.port).toBe(5432);
    expect(config.user).toBe("re@ctor");
    expect(config.password).toBe("p#ss");
  });

  it("maps sslmode to the ssl flag", () => {
    expect(
      buildWorkerDbConfig("postgres://u:p@h/db?sslmode=require", pool).ssl,
    ).toBe(true);
    expect(
      buildWorkerDbConfig("postgres://u:p@h/db?sslmode=disable", pool).ssl,
    ).toBe(false);
    expect(buildWorkerDbConfig("postgres://u:p@h/db?ssl=true", pool).ssl).toBe(
      true,
    );
  });

  it("rejects URLs without a user", () => {
    expect(() => buildWorkerDbConfig("postgres://host:5432/db", pool)).toThrow(
      /credentials/,
    );
  });

  it("rejects URLs without a database", () => {
    expect(() => buildWorkerDbConfig("postgres://u:p@host:5432", pool)).toThrow(
      /database/,
    );
  });

  it("rejects non-URL values", () => {
    expect(() => buildWorkerDbConfig("./.ph/reactor-storage", pool)).toThrow(
      /postgres/,
    );
  });
});

describe("resolveWorkerModelSpecs", () => {
  const baseModels = [
    documentModelDocumentModelModule,
    driveDocumentModelModule,
    reactorDriveDocumentModelModule,
  ] as unknown as DocumentModelModule[];

  it("resolves the base models to importable file specs", async () => {
    const specs = await resolveWorkerModelSpecs({
      packages: [],
      requiredModelKeys: baseModels.map(modelKey),
      logger: stubLogger(),
    });
    expect(specs.length).toBeGreaterThanOrEqual(baseModels.length);
    for (const spec of specs) {
      expect("filePath" in spec && spec.filePath).toBeTruthy();
      expect(spec.exportName).toBeTruthy();
    }
  });

  it("skips unknown packages with a warning but keeps base coverage", async () => {
    const logger = stubLogger();
    const specs = await resolveWorkerModelSpecs({
      packages: ["@powerhousedao/definitely-not-a-package"],
      requiredModelKeys: baseModels.map(modelKey),
      logger,
    });
    expect(specs.length).toBeGreaterThanOrEqual(baseModels.length);
    expect(logger.warn).toHaveBeenCalled();
  });

  it("throws when a required model has no importable source", async () => {
    await expect(
      resolveWorkerModelSpecs({
        packages: [],
        requiredModelKeys: ["acme/unknown-type@1"],
        logger: stubLogger(),
      }),
    ).rejects.toThrow(/acme\/unknown-type@1/);
  });
});

describe("modelKey", () => {
  it("defaults the version to 1", () => {
    expect(
      modelKey(
        documentModelDocumentModelModule as unknown as DocumentModelModule,
      ),
    ).toBe(
      `${documentModelDocumentModelModule.documentModel.global.id}@${documentModelDocumentModelModule.version ?? 1}`,
    );
  });
});
