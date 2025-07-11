import { childLogger } from "#utils/logger";
import {
  type Kysely,
  type Migration,
  type MigrationProvider,
  Migrator,
} from "kysely";
import * as init from "./migrations/00_init.js";

const logger = childLogger(["RelationalListenerStorage"]);

export class RelationalListenerStorageMigrationProvider
  implements MigrationProvider
{
  getMigrations(): Promise<Record<string, Migration>> {
    return Promise.resolve({ "00_init": init });
  }
}

export async function migrateToLatest(db: Kysely<any>) {
  const migrator = new Migrator({
    db,
    provider: new RelationalListenerStorageMigrationProvider(),
  });

  const { error, results } = await migrator.migrateToLatest();

  results?.forEach((it) => {
    if (it.status === "Success") {
      logger.info(`migration "${it.migrationName}" was executed successfully`);
    } else if (it.status === "Error") {
      logger.error(`failed to execute migration "${it.migrationName}"`);
    }
  });

  if (error) {
    logger.error("failed to migrate");
    logger.error(error);
  }
}
