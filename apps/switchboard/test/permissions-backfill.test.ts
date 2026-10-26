import { PGlite } from "@electric-sql/pglite";
import { getDbClient } from "@powerhousedao/reactor-api";
import type { ILogger } from "document-model";
import { Kysely, PostgresDialect, sql } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import pg from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  backfillPermissionTables,
  MIGRATED_TABLE_SUFFIX,
} from "../src/permissions-backfill.mjs";

/** What reactor-api's migrations 001 to 003 leave on the read-model store. */
const LEGACY_DDL = `
  CREATE TABLE "DocumentPermission" (
    "id" SERIAL PRIMARY KEY,
    "documentId" VARCHAR(255) NOT NULL,
    "userAddress" VARCHAR(255) NOT NULL,
    "permission" VARCHAR(20) NOT NULL CHECK ("permission" IN ('READ', 'WRITE', 'ADMIN')),
    "grantedBy" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE ("documentId", "userAddress")
  );
  CREATE TABLE "OperationUserPermission" (
    "id" SERIAL PRIMARY KEY,
    "documentId" VARCHAR(255) NOT NULL,
    "operationType" VARCHAR(255) NOT NULL,
    "userAddress" VARCHAR(255) NOT NULL,
    "grantedBy" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE ("documentId", "operationType", "userAddress")
  );
  CREATE TABLE "DocumentProtection" (
    "documentId" VARCHAR(255) PRIMARY KEY,
    "protected" BOOLEAN NOT NULL DEFAULT false,
    "ownerAddress" VARCHAR(255),
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`;

/** What reactor migration 029 creates in the reactor schema. */
const REACTOR_DDL = `
  CREATE SCHEMA reactor;
  CREATE TABLE reactor."DocumentPermission" (
    "id" SERIAL PRIMARY KEY,
    "documentId" VARCHAR(255) NOT NULL,
    "userAddress" VARCHAR(255) NOT NULL,
    "permission" VARCHAR(20) NOT NULL CHECK ("permission" IN ('READ', 'WRITE', 'ADMIN')),
    "grantedBy" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE ("documentId", "userAddress")
  );
  CREATE TABLE reactor."OperationUserPermission" (
    "id" SERIAL PRIMARY KEY,
    "documentId" VARCHAR(255) NOT NULL,
    "operationType" VARCHAR(255) NOT NULL,
    "userAddress" VARCHAR(255) NOT NULL,
    "grantedBy" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE ("documentId", "operationType", "userAddress")
  );
  CREATE TABLE reactor."DocumentProtection" (
    "documentId" VARCHAR(255) PRIMARY KEY,
    "protected" BOOLEAN NOT NULL DEFAULT false,
    "ownerAddress" VARCHAR(255),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`;

const CREATED = new Date("2026-01-02T03:04:05.000Z");

function createLogger(): ILogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  } as unknown as ILogger;
}

/** The two stores a test runs against; `destroy` releases both. */
type BackfillStores = {
  readModelDb: Kysely<any>;
  reactorBase: Kysely<any>;
  execRead: (statements: string) => Promise<void>;
  execReactor: (statements: string) => Promise<void>;
  destroy: () => Promise<void>;
};

function openPgliteStores(): Promise<BackfillStores> {
  const readPg = new PGlite();
  const reactorPg = new PGlite();
  const readModelDb = new Kysely<any>({ dialect: new PGliteDialect(readPg) });
  const reactorBase = new Kysely<any>({
    dialect: new PGliteDialect(reactorPg),
  });
  return Promise.resolve({
    readModelDb,
    reactorBase,
    execRead: async (statements) => {
      await readPg.exec(statements);
    },
    execReactor: async (statements) => {
      await reactorPg.exec(statements);
    },
    destroy: async () => {
      await readModelDb.destroy();
      await reactorBase.destroy();
    },
  });
}

/**
 * The read-model store opened the way reactor-api opens it (knex over PGlite,
 * UTC timestamp parsers), which is the handle the switchboard receives.
 */
function openReactorApiReadStore(): Promise<BackfillStores> {
  const read = getDbClient();
  const reactorPg = new PGlite();
  const reactorBase = new Kysely<any>({
    dialect: new PGliteDialect(reactorPg),
  });
  return Promise.resolve({
    readModelDb: read.db,
    reactorBase,
    execRead: async (statements) => {
      await read.pglite!.exec(statements);
    },
    execReactor: async (statements) => {
      await reactorPg.exec(statements);
    },
    destroy: async () => {
      await read.knex.destroy();
      if (!read.pglite!.closed) await read.pglite!.close();
      await reactorBase.destroy();
    },
  });
}

/**
 * Both stores in one Postgres database, the read model in `public` and the
 * reactor in its schema: what a bare `dbPath` gives a Postgres deployment.
 */
async function openPostgresStores(url: string): Promise<BackfillStores> {
  const name = `sb_permissions_backfill_${process.pid}`;
  const admin = new pg.Pool({ connectionString: url });
  await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${name}"`);
  const target = new URL(url);
  target.pathname = `/${name}`;
  const readPool = new pg.Pool({ connectionString: target.toString() });
  const reactorPool = new pg.Pool({ connectionString: target.toString() });
  for (const pool of [readPool, reactorPool]) {
    // Dropping the database terminates whatever is still connected to it.
    pool.on("error", (error: Error & { code?: string }) => {
      if (error.code !== "57P01") throw error;
    });
  }
  const readModelDb = new Kysely<any>({
    dialect: new PostgresDialect({ pool: readPool }),
  });
  const reactorBase = new Kysely<any>({
    dialect: new PostgresDialect({ pool: reactorPool }),
  });
  return {
    readModelDb,
    reactorBase,
    execRead: async (statements) => {
      await readPool.query(statements);
    },
    execReactor: async (statements) => {
      await reactorPool.query(statements);
    },
    destroy: async () => {
      try {
        await readModelDb.destroy();
        await reactorBase.destroy();
      } finally {
        await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
        await admin.end();
      }
    },
  };
}

const PG_URL = process.env.REACTOR_TEST_PG_URL;

defineBackfillCases("PGlite", openPgliteStores, false);
defineBackfillCases("reactor-api read store", openReactorApiReadStore, false);
defineBackfillCases("Postgres", () => openPostgresStores(PG_URL!), !PG_URL);

function defineBackfillCases(
  backend: string,
  open: () => Promise<BackfillStores>,
  skip: boolean,
): void {
  describe.skipIf(skip)(`backfillPermissionTables [${backend}]`, () => {
    let stores: BackfillStores;
    let readModelDb: Kysely<any>;
    let reactorDb: Kysely<any>;
    let logger: ILogger;

    const seedLegacy = async () => {
      await stores.execRead(LEGACY_DDL);
      await readModelDb
        .insertInto("DocumentPermission")
        .values([
          {
            documentId: "doc-1",
            userAddress: "0xreader",
            permission: "READ",
            grantedBy: "0xowner",
            createdAt: CREATED,
            updatedAt: CREATED,
          },
          {
            documentId: "doc-1",
            userAddress: "0xowner",
            permission: "ADMIN",
            grantedBy: "0xowner",
            createdAt: CREATED,
            updatedAt: CREATED,
          },
        ])
        .execute();
      await readModelDb
        .insertInto("OperationUserPermission")
        .values({
          documentId: "doc-1",
          operationType: "SET_NAME",
          userAddress: "0xreader",
          grantedBy: "0xowner",
          createdAt: CREATED,
        })
        .execute();
      await readModelDb
        .insertInto("DocumentProtection")
        .values({
          documentId: "doc-1",
          protected: true,
          ownerAddress: "0xowner",
          createdAt: CREATED,
          updatedAt: CREATED,
        })
        .execute();
    };

    const readModelTables = async (): Promise<string[]> => {
      const result = await sql<{ table_name: string }>`
      select table_name from information_schema.tables
      where table_schema = 'public' order by table_name
    `.execute(readModelDb);
      return result.rows.map((row) => row.table_name);
    };

    beforeEach(async () => {
      stores = await open();
      readModelDb = stores.readModelDb;
      await stores.execReactor(REACTOR_DDL);
      reactorDb = stores.reactorBase.withSchema("reactor");
      logger = createLogger();
    });

    afterEach(async () => {
      await stores.destroy();
    });

    it("copies every row into the reactor store and renames the read-model tables", async () => {
      await seedLegacy();

      const outcome = await backfillPermissionTables(
        readModelDb,
        reactorDb,
        logger,
      );

      expect(outcome).toEqual({
        status: "copied",
        counts: {
          DocumentPermission: 2,
          OperationUserPermission: 1,
          DocumentProtection: 1,
        },
      });
      expect(
        await reactorDb
          .selectFrom("DocumentPermission")
          .select(["documentId", "userAddress", "permission", "grantedBy"])
          .orderBy("id")
          .execute(),
      ).toEqual([
        {
          documentId: "doc-1",
          userAddress: "0xreader",
          permission: "READ",
          grantedBy: "0xowner",
        },
        {
          documentId: "doc-1",
          userAddress: "0xowner",
          permission: "ADMIN",
          grantedBy: "0xowner",
        },
      ]);
      expect(
        await reactorDb
          .selectFrom("OperationUserPermission")
          .select(["documentId", "operationType", "userAddress", "grantedBy"])
          .execute(),
      ).toEqual([
        {
          documentId: "doc-1",
          operationType: "SET_NAME",
          userAddress: "0xreader",
          grantedBy: "0xowner",
        },
      ]);
      const protection = await reactorDb
        .selectFrom("DocumentProtection")
        .selectAll()
        .executeTakeFirstOrThrow();
      expect(protection).toMatchObject({
        documentId: "doc-1",
        protected: true,
        ownerAddress: "0xowner",
      });
      const legacyCreated = await readModelDb
        .selectFrom(`DocumentProtection${MIGRATED_TABLE_SUFFIX}`)
        .select("createdAt")
        .executeTakeFirstOrThrow();
      expect((protection.createdAt as Date).getTime()).toBe(
        (legacyCreated.createdAt as Date).getTime(),
      );

      expect(await readModelTables()).toEqual([
        `DocumentPermission${MIGRATED_TABLE_SUFFIX}`,
        `DocumentProtection${MIGRATED_TABLE_SUFFIX}`,
        `OperationUserPermission${MIGRATED_TABLE_SUFFIX}`,
      ]);
      expect(logger.info).toHaveBeenCalledWith(
        `Permission tables backfill: copied DocumentPermission=2, OperationUserPermission=1, DocumentProtection=1 from the read-model store to the reactor store; renamed the read-model tables to *${MIGRATED_TABLE_SUFFIX}`,
      );
    });

    it("does nothing on a second run", async () => {
      await seedLegacy();
      await backfillPermissionTables(readModelDb, reactorDb, logger);

      const outcome = await backfillPermissionTables(
        readModelDb,
        reactorDb,
        logger,
      );

      expect(outcome).toEqual({ status: "already-backfilled" });
      const count = await reactorDb
        .selectFrom("DocumentPermission")
        .select((eb) => eb.fn.countAll().as("count"))
        .executeTakeFirstOrThrow();
      expect(Number(count.count)).toBe(2);
    });

    it("does nothing on a fresh install", async () => {
      const outcome = await backfillPermissionTables(
        readModelDb,
        reactorDb,
        logger,
      );

      expect(outcome).toEqual({ status: "fresh-install" });
      expect(await readModelTables()).toEqual([]);
      expect(logger.info).not.toHaveBeenCalled();
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it("renames empty legacy tables without copying", async () => {
      await stores.execRead(LEGACY_DDL);

      const outcome = await backfillPermissionTables(
        readModelDb,
        reactorDb,
        logger,
      );

      expect(outcome).toEqual({
        status: "copied",
        counts: {
          DocumentPermission: 0,
          OperationUserPermission: 0,
          DocumentProtection: 0,
        },
      });
      expect(await readModelTables()).toHaveLength(3);
    });

    it("only renames when an earlier boot copied the rows but stopped before renaming", async () => {
      await seedLegacy();
      await backfillPermissionTables(readModelDb, reactorDb, logger);
      for (const table of [
        "DocumentPermission",
        "OperationUserPermission",
        "DocumentProtection",
      ]) {
        await sql`ALTER TABLE ${sql.id(`${table}${MIGRATED_TABLE_SUFFIX}`)} RENAME TO ${sql.id(table)}`.execute(
          readModelDb,
        );
      }

      const outcome = await backfillPermissionTables(
        readModelDb,
        reactorDb,
        logger,
      );

      expect(outcome.status).toBe("rename-completed");
      const count = await reactorDb
        .selectFrom("DocumentPermission")
        .select((eb) => eb.fn.countAll().as("count"))
        .executeTakeFirstOrThrow();
      expect(Number(count.count)).toBe(2);
      expect(await readModelTables()).toEqual([
        `DocumentPermission${MIGRATED_TABLE_SUFFIX}`,
        `DocumentProtection${MIGRATED_TABLE_SUFFIX}`,
        `OperationUserPermission${MIGRATED_TABLE_SUFFIX}`,
      ]);
    });

    it("refuses when the reactor store already holds different rows", async () => {
      await seedLegacy();
      await reactorDb
        .insertInto("DocumentPermission")
        .values({
          documentId: "doc-9",
          userAddress: "0xsomeone",
          permission: "WRITE",
          grantedBy: "0xowner",
        })
        .execute();

      const outcome = await backfillPermissionTables(
        readModelDb,
        reactorDb,
        logger,
      );

      expect(outcome.status).toBe("refused");
      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(await readModelTables()).toEqual([
        "DocumentPermission",
        "DocumentProtection",
        "OperationUserPermission",
      ]);
      const count = await reactorDb
        .selectFrom("DocumentPermission")
        .select((eb) => eb.fn.countAll().as("count"))
        .executeTakeFirstOrThrow();
      expect(Number(count.count)).toBe(1);
    });

    it("rolls the copy back when a row does not fit the reactor table", async () => {
      await seedLegacy();
      await stores.execReactor(
        `ALTER TABLE reactor."OperationUserPermission" ADD CONSTRAINT no_set_name CHECK ("operationType" <> 'SET_NAME')`,
      );

      await expect(
        backfillPermissionTables(readModelDb, reactorDb, logger),
      ).rejects.toThrow();

      const count = await reactorDb
        .selectFrom("DocumentPermission")
        .select((eb) => eb.fn.countAll().as("count"))
        .executeTakeFirstOrThrow();
      expect(Number(count.count)).toBe(0);
      expect(await readModelTables()).toEqual([
        "DocumentPermission",
        "DocumentProtection",
        "OperationUserPermission",
      ]);
    });
  });
}
