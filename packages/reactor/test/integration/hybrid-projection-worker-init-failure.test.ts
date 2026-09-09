import type { Kysely } from "kysely";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { createDefaultDatabase } from "../../src/core/create-default-database.js";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { Database } from "../../src/core/types.js";
import { createHybridProjectionCoordinatorFactory } from "../../src/projection/create-hybrid-projection-coordinator.js";
import type { DbConfig } from "../../src/projection/protocol.js";
import { createProjectionThreadTransport } from "../../src/projection/transport.js";

// Runs the .ts entry via tsx; the default entry path points at dist/.
const BOOTSTRAP_PATH = fileURLToPath(
  new URL("./projection-worker-bootstrap.mjs", import.meta.url),
);

/** Nothing listens here, so the worker's first query is refused at once. */
const UNREACHABLE_DB: DbConfig = {
  host: "127.0.0.1",
  port: 5499,
  database: "reactor",
  user: "postgres",
  password: "postgres",
  poolSize: 1,
  connectionTimeoutMillis: 2_000,
};

/**
 * Exercises the init-failure report across a real `MessagePort`: a worker
 * thread that cannot reach its database must fail the build with its own
 * error. Needs no Postgres — the point is that there is none.
 */
describe("hybrid projection worker init failure", () => {
  let db: Kysely<Database> | undefined;

  afterEach(async () => {
    if (db) {
      await db.destroy();
      db = undefined;
    }
  });

  it("fails the build with the worker's error instead of the init timeout", async () => {
    db = await createDefaultDatabase();

    // Far longer than this test may take: only the worker's own report can
    // settle the build, never the timer.
    const build = new ReactorBuilder()
      .withKysely(db)
      .withDocumentModelSources([
        {
          packageName: "document-model",
          exportName: "documentModelDocumentModelModule",
        },
      ])
      .withProjectionWorkerFactory(() =>
        createProjectionThreadTransport(BOOTSTRAP_PATH),
      )
      .withReadModelCoordinatorFactory(
        createHybridProjectionCoordinatorFactory({
          db: UNREACHABLE_DB,
          poolSize: 1,
          initTimeoutMs: 120_000,
          shutdownGraceMs: 500,
        }),
      )
      .buildModule();

    const error = await build.then(
      () => undefined,
      (err: unknown) => err as Error,
    );

    expect(error).toBeDefined();
    expect(error?.message).not.toMatch(/did not become ready/);
    expect(`${error?.name}: ${error?.message}`).toMatch(
      /ECONNREFUSED|ECONNRESET|connect|timeout/i,
    );
  }, 60_000);
});
