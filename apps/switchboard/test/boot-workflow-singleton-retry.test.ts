// A Switchboard refused the workflow singleton at boot retries the claim and
// starts workflows once the holder lets go. The runtime it composes then has
// to be reachable: its GraphQL face mounted, not only registered.
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  acquireWorkflowSingletonLease,
  type WorkflowSingletonLease,
} from "@powerhousedao/reactor-workflow";
import {
  createRelationalDb,
  type IRelationalDb,
} from "@powerhousedao/shared/processors";
import type { ILogger } from "document-model";
import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import { describe, expect, it, vi } from "vitest";
import { startSwitchboard } from "../src/server.mjs";

const PG_URL = process.env.REACTOR_TEST_PG_URL;
const DATABASE = "switchboard_workflow_retry";

function stubLogger(): ILogger {
  const logger = {
    verbose: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };
  logger.child.mockReturnValue(logger);
  return logger as unknown as ILogger;
}

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  await new Promise((resolve) => server.close(resolve));
  if (address === null || typeof address === "string") {
    throw new Error("no port");
  }
  return address.port;
}

async function queryHealth(port: number): Promise<string | undefined> {
  const response = await fetch(`http://127.0.0.1:${port}/graphql`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: "{ workflowRuntime { health } }" }),
  });
  const body = (await response.json()) as {
    data?: { workflowRuntime?: { health?: string } };
  };
  return body.data?.workflowRuntime?.health;
}

describe.skipIf(!PG_URL)(
  "a Switchboard that claims the workflow singleton after boot [Postgres]",
  () => {
    it("serves the workflow GraphQL API once it has the claim", async () => {
      const admin = new pg.Pool({ connectionString: PG_URL });
      await admin.query(`DROP DATABASE IF EXISTS "${DATABASE}" WITH (FORCE)`);
      await admin.query(`CREATE DATABASE "${DATABASE}"`);
      const url = new URL(PG_URL!);
      url.pathname = `/${DATABASE}`;
      const readModelUrl = url.toString();
      const holderDb = new Kysely<unknown>({
        dialect: new PostgresDialect({
          pool: new pg.Pool({ connectionString: readModelUrl, max: 2 }),
        }),
      });
      const tempRoot = await mkdtemp(join(tmpdir(), "switchboard-wf-retry-"));
      const previousReactorDb = process.env.PH_REACTOR_DATABASE_URL;
      process.env.PH_REACTOR_DATABASE_URL = join(tempRoot, "reactor-storage");
      let holder: WorkflowSingletonLease | undefined;
      let switchboard: Awaited<ReturnType<typeof startSwitchboard>> | undefined;
      try {
        // Another live host holds the singleton over the same journal.
        holder = await acquireWorkflowSingletonLease({
          relationalDb: createRelationalDb(holderDb) as IRelationalDb,
          logger: stubLogger(),
          owner: "the-other-host",
        });

        switchboard = await startSwitchboard({
          workflows: { enabled: true },
          dbPath: readModelUrl,
          port: await freePort(),
          strictPort: true,
          mcp: false,
          disableLocalPackages: true,
          identity: { keypairPath: join(tempRoot, "identity.json") },
          logger: stubLogger(),
        });
        expect(switchboard.workflowTriggers).toBeUndefined();
        expect(await queryHealth(switchboard.port)).toBeUndefined();

        await holder.release();
        holder = undefined;

        const port = switchboard.port;
        await vi.waitFor(
          async () => expect(await queryHealth(port)).toBe("ok"),
          { timeout: 60_000, interval: 500 },
        );
        expect(switchboard.workflowTriggers).toEqual({ status: "available" });

        await switchboard.shutdown();
        switchboard = undefined;
      } finally {
        await holder?.release();
        await switchboard?.shutdown();
        await holderDb.destroy();
        if (previousReactorDb === undefined) {
          delete process.env.PH_REACTOR_DATABASE_URL;
        } else {
          process.env.PH_REACTOR_DATABASE_URL = previousReactorDb;
        }
        // Not forced: terminating a pool's idle connections under it raises
        // an unhandled error. A database left behind is dropped next run.
        await admin
          .query(`DROP DATABASE IF EXISTS "${DATABASE}"`)
          .catch(() => undefined);
        await admin.end();
        await rm(tempRoot, { recursive: true, force: true });
      }
    }, 120_000);
  },
);
