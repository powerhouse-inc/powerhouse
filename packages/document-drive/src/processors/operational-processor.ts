import { type PHDocument } from "document-model";
import { FileMigrationProvider, Kysely, Migrator } from "kysely";
import { KyselyKnexDialect, PGColdDialect } from "kysely-knex";
import fs from "node:fs";
import path from "node:path";
import { type InternalTransmitterUpdate } from "../server/listener/transmitter/internal.js";
import { type Db, type IProcessor } from "./types.js";

/**
 * PowerhouseDB is the standardized database interface for operational processors.
 * This abstraction provides type-safe database operations while hiding the underlying
 * database framework implementation details.
 */
export type PowerhouseDB<TDatabase = any> = Kysely<TDatabase>;

/**
 * Base class for operational processors that require persistent database storage.
 * This class abstracts database initialization, migration management, and resource cleanup,
 * allowing derived classes to focus on business logic.
 */
export abstract class BaseOperationalProcessor<TDatabase = any>
  implements IProcessor
{
  protected powerhouseDb: Promise<PowerhouseDB<TDatabase>>;
  private readonly migrationsPath: string;

  constructor(
    protected operationalStore: Db,
    migrationsPath?: string,
  ) {
    // Determine migrations path - default to project-level migrations
    if (migrationsPath) {
      this.migrationsPath = migrationsPath;
    } else {
      // Use project-level migrations directory
      this.migrationsPath = path.join(process.cwd(), "./migrations");
    }

    this.powerhouseDb = this.initializeDatabase();
  }

  /**
   * Initializes the database connection and runs migrations.
   * This method is called during construction and should not be called directly.
   */
  private async initializeDatabase(): Promise<PowerhouseDB<TDatabase>> {
    const db = new Kysely<TDatabase>({
      dialect: new KyselyKnexDialect({
        knex: this.operationalStore,
        kyselySubDialect: new PGColdDialect(),
      }),
    });

    // Check if migrations directory exists
    if (!fs.existsSync(this.migrationsPath)) {
      console.warn(`Migrations directory not found: ${this.migrationsPath}`);
      return db;
    }

    // Run migrations
    const migrator = new Migrator({
      db,
      provider: new FileMigrationProvider({
        path: this.migrationsPath,
      }),
    });

    const { error, results } = await migrator.migrateToLatest();

    if (error) {
      console.error("Migration failed:", error);
      throw new Error(`Migration failed: ${error}`);
    }

    if (results && results.length > 0) {
      console.log(
        `Applied ${results.length} migrations for ${this.constructor.name}`,
      );
    }

    return db;
  }

  /**
   * Abstract method that derived classes must implement.
   * This is where the business logic for processing document operations should be implemented.
   */
  abstract onStrands<TDocument extends PHDocument>(
    strands: InternalTransmitterUpdate<TDocument>[],
  ): Promise<void>;

  /**
   * Called when the processor is disconnected. This method cleans up resources
   * and can be overridden by derived classes for additional cleanup.
   */
  async onDisconnect(): Promise<void> {
    try {
      const db = await this.powerhouseDb;
      await db.destroy();
    } catch (error) {
      console.error("Error during processor disconnect:", error);
    }
  }

  /**
   * Helper method to get the database instance.
   * This provides type-safe access to the PowerhouseDB instance.
   */
  protected async getDb(): Promise<PowerhouseDB<TDatabase>> {
    return this.powerhouseDb;
  }

  /**
   * Helper method for health checks.
   * This can be used to verify that the processor's database tables are accessible.
   */
  protected async healthCheck(tableName: string): Promise<boolean> {
    try {
      const db = await this.powerhouseDb;
      await db.selectFrom(tableName).limit(1).execute();
      return true;
    } catch (error) {
      console.error(`Health check failed for table ${tableName}:`, error);
      return false;
    }
  }

  /**
   * Gets the migrations path used by this processor.
   * This can be useful for debugging or logging purposes.
   */
  protected getMigrationsPath(): string {
    return this.migrationsPath;
  }
}
