# Relational Listener Storage: Schema Codegen & Migration Guide

This folder implements the **RelationalListenerStorage** adapter for the IListenerStorage interface, providing a normalized SQL-backed storage for listeners using [Kysely](https://kysely.dev/). This document covers how the schema, code generation, and migrations work.

## Folder Structure

- `migrations/`: Contains migration scripts (e.g., `00_init.ts`).
- `schema.ts`: Generated TypeScript types for the listener table, kept in sync with the migration schema.
- `migrate.ts`: Migration runner and provider logic.
- `relational.ts`: Implementation of `RelationalListenerStorage`.

## How Migration & Schema Codegen Works

### 1. Adding a New Migration

- **Create a migration script** in `migrations/` (e.g., `01_add_field.ts`).
- **Manually import** your new migration in `RelationalListenerStorageMigrationProvider` (in `migrate.ts`).
  - Example:
    ```ts
    import * as migration01 from "./migrations/01_add_field.js";
    // ...
    return Promise.resolve({
      "00_init": init,
      "01_add_field": migration01,
    });
    ```
- **Do NOT rely on file-system auto-discovery**. All migrations must be explicitly imported and registered as this might run on the browser.

### 2. Updating Generated Schema Types

- After adding or changing migrations, run:
  ```sh
  pnpm scripts:generate-listener-schema
  ```
- This updates `schema.ts` to match the latest database schema, ensuring type safety for Kysely queries.

### 3. Running Migrations Programmatically

- Use the static method:
  ```ts
  await RelationalListenerStorage.migrateDatabase(db);
  ```
- This will apply all registered migrations to the target database.
