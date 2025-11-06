import type { Migration } from "kysely";

export type MigrationStrategy = "auto" | "manual" | "none";

export interface MigrationResult {
  success: boolean;
  migrationsExecuted: string[];
  error?: Error;
}

export type ReactorMigration = Migration;
