import type { Database } from "../db/database.js";
import { createPostgresDatabase } from "../db/database.js";
import { prepareSchema } from "../db/migrations.js";
import type { AuthStore, UserRecord } from "./auth-store.js";

/** A database over a Postgres connection string. */
export function createPgPool(databaseUrl: string): Database {
  return createPostgresDatabase(databaseUrl);
}

/**
 * Database-backed AuthStore over `registry_users` and `registry_package_owners`.
 *
 * Ownership claim is race-free: `INSERT ... ON CONFLICT DO NOTHING` means the
 * first publisher wins atomically; the follow-up read returns the actual
 * owners so a losing racer is denied.
 */
export function createPgStore(
  pool: Database,
  options: { migrate?: boolean } = {},
): AuthStore {
  let initialized: Promise<void> | null = null;

  return {
    // Retried on failure: a replica that lost the first attempt must not keep the error
    init(): Promise<void> {
      initialized ??= prepareSchema(pool, options.migrate ?? true).catch(
        (err: unknown) => {
          initialized = null;
          throw err;
        },
      );
      return initialized;
    },

    async getUser(username: string): Promise<UserRecord | null> {
      const res = await pool.query<{ password_hash: string }>(
        "SELECT password_hash FROM registry_users WHERE username = $1",
        [username],
      );
      const row = res.rows[0] as { password_hash: string } | undefined;
      return row ? { passwordHash: row.password_hash } : null;
    },

    async createUser(username: string, passwordHash: string): Promise<boolean> {
      // Atomic: the PRIMARY KEY enforces uniqueness. A duplicate raises a
      // unique-violation (SQLSTATE 23505) — catch it as "already registered".
      try {
        await pool.query(
          "INSERT INTO registry_users (username, password_hash) VALUES ($1, $2)",
          [username, passwordHash],
        );
        return true;
      } catch (err) {
        if ((err as { code?: string }).code === "23505") return false;
        throw err;
      }
    },

    async getOwners(pkg: string): Promise<string[] | null> {
      const res = await pool.query<{ owners: string[] }>(
        "SELECT owners FROM registry_package_owners WHERE package_name = $1",
        [pkg],
      );
      return res.rows[0]?.owners ?? null;
    },

    async getOwnersFor(pkgs: string[]): Promise<Record<string, string[]>> {
      if (pkgs.length === 0) return {};
      const placeholders = pkgs.map((_, i) => `$${i + 1}`).join(",");
      const res = await pool.query<{ package_name: string; owners: string[] }>(
        `SELECT package_name, owners FROM registry_package_owners WHERE package_name IN (${placeholders})`,
        pkgs,
      );
      const out: Record<string, string[]> = {};
      for (const row of res.rows) out[row.package_name] = row.owners;
      return out;
    },

    async claimOwner(pkg: string, username: string): Promise<string[]> {
      // First publisher wins atomically; then read the actual owners.
      await pool.query(
        `INSERT INTO registry_package_owners (package_name, owners)
         VALUES ($1, ARRAY[$2]::text[])
         ON CONFLICT (package_name) DO NOTHING`,
        [pkg, username],
      );
      const res = await pool.query<{ owners: string[] }>(
        "SELECT owners FROM registry_package_owners WHERE package_name = $1",
        [pkg],
      );
      return res.rows[0]?.owners ?? [];
    },

    close(): Promise<void> {
      return pool.close();
    },
  };
}
