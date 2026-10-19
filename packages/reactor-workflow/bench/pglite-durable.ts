// The bench's databases as Switchboard keeps them on disk: PGlite over the
// durable NodeFS, which fsyncs every write unless PH_PGLITE_FSYNC=0.
import { PGlite } from "@electric-sql/pglite";
import { NodeFS } from "@electric-sql/pglite/nodefs";
import {
  createRelationalDb,
  type IRelationalDb,
} from "@powerhousedao/shared/processors";
import knex from "knex";
import ClientPgLite from "knex-pglite";
import { Kysely, type Dialect } from "kysely";
import { KyselyKnexDialect, PGColdDialect } from "kysely-knex";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const UTC_PARSERS = {
  1114: (value: string) => new Date(`${value.replace(" ", "T")}Z`),
} as const;

export interface BenchDurablePglite {
  reactorKysely: Kysely<never>;
  relationalDb: IRelationalDb;
}

export async function createBenchDurablePglite(
  dir: string,
): Promise<BenchDurablePglite> {
  // Not a dependency of this package: the bench takes reactor-api's build from the workspace.
  const { createDurableNodeFs, resolvePgliteFsync } =
    await import("../../reactor-api/dist/src/pglite/pglite-node.mjs");
  const fsync = resolvePgliteFsync(process.env);
  // Not awaited: knex clones its config, and a ready instance holds the wasm memory.
  const open = (name: string) => {
    const path = join(dir, name);
    mkdirSync(path, { recursive: true });
    return new PGlite({
      fs: createDurableNodeFs(NodeFS, path, { fsync }),
      parsers: UTC_PARSERS,
    });
  };

  // The reactor's own dialect, resolved from the reactor package.
  const fromReactor = createRequire(
    import.meta.resolve("@powerhousedao/reactor"),
  );
  const { PGliteDialect } = (await import(
    fromReactor.resolve("kysely-pglite-dialect")
  )) as { PGliteDialect: new (db: PGlite) => Dialect };
  const reactorKysely = new Kysely<never>({
    dialect: new PGliteDialect(open("reactor")),
  });

  const client = knex({
    client: ClientPgLite as typeof knex.Client,
    connection: { pglite: open("journal") } as never,
  });
  const relationalDb = createRelationalDb(
    new Kysely<unknown>({
      dialect: new KyselyKnexDialect({
        knex: client,
        kyselySubDialect: new PGColdDialect(),
      }),
    }),
  );
  console.log(`pglite-durable ${dir} fsync=${fsync}`);
  return { reactorKysely, relationalDb };
}
