import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { relationalDbMigrationsTemplate } from "templates";
import { afterEach, describe, expect, it } from "vitest";
import { generateDBSchema } from "./kysely.js";

const temporary: string[] = [];

afterEach(() => {
  for (const dir of temporary.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeDir() {
  const dir = mkdtempSync(join(tmpdir(), "ph-kysely-"));
  temporary.push(dir);
  return dir;
}

// Each run spawns kysely-pglite in node: over 5s on a Windows runner.
describe("generateDBSchema", { timeout: 60_000 }, () => {
  it("names the table types <Name>Table and keeps DB", async () => {
    const dir = makeDir();
    const migrationFile = join(dir, "migrations.ts");
    writeFileSync(
      migrationFile,
      `export async function up(db: any): Promise<void> {
  await db.schema
    .createTable("finished_books")
    .addColumn("document_id", "varchar(255)", (col: any) => col.primaryKey())
    .addColumn("title", "varchar(255)", (col: any) => col.notNull())
    .execute();
  await db.schema
    .createTable("authors")
    .addColumn("name", "varchar(255)", (col: any) => col.primaryKey())
    .execute();
}
`,
    );

    await generateDBSchema({ migrationFile });

    const schema = readFileSync(join(dir, "schema.ts"), "utf8");
    expect(schema).toContain("export interface FinishedBooksTable {");
    expect(schema).toContain("export interface AuthorsTable {");
    expect(schema).not.toMatch(/export interface (FinishedBooks|Authors) \{/);
    expect(schema).toMatch(
      /export interface DB \{\s*authors: AuthorsTable;\s*finished_books: FinishedBooksTable;\s*\}/,
    );
  });

  it("generates the scaffold's own schema", async () => {
    const dir = makeDir();
    const migrationFile = join(dir, "migrations.ts");
    writeFileSync(migrationFile, relationalDbMigrationsTemplate());

    await generateDBSchema({ migrationFile });

    const schema = readFileSync(join(dir, "schema.ts"), "utf8");
    expect(schema).toMatch(
      /export interface DB \{\s*documents: DocumentsTable;\s*\}/,
    );
  });
});
