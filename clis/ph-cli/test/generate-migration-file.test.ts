import {
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { run } from "cmd-ts";
import { generateMigrationFileCmd } from "../src/commands/generate-migration-file.js";
import { startGenerateMigrationFile } from "../src/services/generate-migration-file.js";
import { startGenerateProcessor } from "../src/services/generate-processor.js";

const MIGRATIONS = "processors/stock-indexer/migrations.ts";
const SCHEMA = "processors/stock-indexer/schema.ts";
const originalCwd = process.cwd();
let root: string;

type Manifest = Record<
  "peerDependencies" | "devDependencies",
  Record<string, string>
>;
const readManifest = () =>
  JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as Manifest;

beforeEach(async () => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "ph-migration-file-")));
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify(
      {
        name: "@acme/stockroom",
        type: "module",
        devDependencies: { "document-model": "6.0.0" },
        peerDependencies: { "document-model": "6.0.0" },
      },
      null,
      2,
    ),
  );
  writeFileSync(
    join(root, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { module: "nodenext" } }, null, 2),
  );
  vi.spyOn(console, "log").mockImplementation(() => {});
  await startGenerateProcessor(
    {
      name: "Stock Indexer",
      type: "relationalDb",
      documentTypes: ["acme/stock-item"],
      apps: ["switchboard"],
      document: undefined,
      dir: undefined,
      all: false,
      extract: false,
      debug: undefined,
      skipInstall: true,
    },
    root,
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  process.chdir(originalCwd);
  rmSync(root, { recursive: true, force: true });
});

describe("ph-cli generate migration-file", () => {
  it("writes the schema of the processor's migrations", async () => {
    writeFileSync(
      join(root, MIGRATIONS),
      readFileSync(join(root, MIGRATIONS), "utf8").replace(
        '.addColumn("updated_at", "varchar(32)", (col) => col.notNull())',
        '.addColumn("updated_at", "varchar(32)", (col) => col.notNull())\n    .addColumn("created_at", "timestamp", (col) => col.defaultTo("now()"))',
      ),
    );

    await startGenerateMigrationFile(
      { migrationFile: MIGRATIONS, schemaFile: undefined, skipInstall: true },
      root,
    );

    const schema = readFileSync(join(root, SCHEMA), "utf8");
    expect(schema).toContain('import type { ColumnType } from "kysely";');
    expect(schema).toContain("created_at: Generated<Timestamp | null>;");
    expect(schema).toContain("documents: DocumentsTable;");
  }, 60_000);

  it("adds kysely, which the schema imports, to package.json", async () => {
    const manifest = readManifest();
    expect(manifest.peerDependencies.kysely).toBe("^0.28");
    expect(manifest.devDependencies.kysely).toBe("0.28.16");

    // A project from before kysely was a feature dependency.
    delete manifest.peerDependencies.kysely;
    delete manifest.devDependencies.kysely;
    writeFileSync(join(root, "package.json"), JSON.stringify(manifest));
    await startGenerateMigrationFile(
      { migrationFile: MIGRATIONS, schemaFile: undefined, skipInstall: true },
      root,
    );

    expect(readManifest().peerDependencies.kysely).toBe("^0.28");
  }, 60_000);

  it("fails when the migrations do", async () => {
    writeFileSync(
      join(root, MIGRATIONS),
      'export async function up() { throw new Error("broken"); }\n',
    );
    process.chdir(root);

    await expect(
      run(generateMigrationFileCmd, ["--path", MIGRATIONS, "--skip-install"]),
    ).rejects.toThrow(`Could not generate ${join(root, SCHEMA)}`);
  }, 60_000);
});
