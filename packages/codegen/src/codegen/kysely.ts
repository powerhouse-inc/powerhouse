import { Kysely } from "kysely";
import { Codegen, KyselyPGlite } from "kysely-pglite";

export interface IOptions {
  migrationFile: string;
  schemaFile?: string;
}

export async function generateDBSchema({
  migrationFile,
  schemaFile,
}: IOptions) {
  const { dialect } = new KyselyPGlite("memory://");
  const db = new Kysely({ dialect });

  try {
    const migration = (await import(migrationFile)) as {
      up: (db: Kysely<any>) => Promise<void>;
    };
    await migration.up(db);
  } catch (error: unknown) {
    console.error("Error running migration:", error);
    throw error;
  }

  const codegen = new Codegen(dialect);
  // TODO: Do not pass in outFile, so we can replace the kysely import
  const typesStr = await codegen.generate({
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    db: db as any,
    outFile: schemaFile,
  });

  console.log(`Types generated at ${schemaFile}`);
}
