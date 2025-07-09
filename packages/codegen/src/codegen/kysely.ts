import { Kysely, type Migration } from "kysely";
import { Codegen, KyselyPGlite } from "kysely-pglite";
import { readFileSync } from "node:fs";
import { transform } from "sucrase";

export interface IOptions {
  migrationFile: string;
  schemaFile?: string;
}

async function loadMigration(file: string) {
  // read ts code as a string and compile it to a js string
  const code = readFileSync(file, "utf-8");
  const compiledCode = transform(code, {
    transforms: ["typescript"],
  }).code;

  // create esm module from js code
  const base64 = Buffer.from(compiledCode).toString("base64");
  const dataUrl = `data:text/javascript;base64,${base64}`;
  const mod = (await import(dataUrl)) as Migration;
  return mod;
}

export async function generateDBSchema({
  migrationFile,
  schemaFile,
}: IOptions) {
  const { dialect } = new KyselyPGlite("memory://");
  const db = new Kysely({ dialect });
  try {
    const migration = await loadMigration(migrationFile);
    await migration.up(db);
  } catch (error) {
    console.error("Error running migration:", error);
    throw error;
  }
  const codegen = new Codegen(dialect);
  // TODO: Do not pass in outFile, so we can replace the kysely import
  await codegen.generate({
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    db: db as any,
    outFile: schemaFile,
    logger: undefined,
  });
  console.log(`Schema types generated at ${schemaFile}`);
}
