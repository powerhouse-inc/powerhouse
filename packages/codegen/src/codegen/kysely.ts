import { generateId } from "document-model";
import { Kysely, type Migration } from "kysely";
import { Codegen, KyselyPGlite } from "kysely-pglite";

interface IGenerateOptions {
  camelCase?: boolean;
  excludePattern?: string;
  includePattern?: string;
  outFile?: string;
  print?: boolean;
  runtimeEnums?: boolean;
  schema?: string;
  transformer?: Transformer;
  typeOnlyImports?: boolean;
  verify?: boolean;
}

export interface IOptions {
  migrationFile: string;
  schemaFile?: string;
}

export async function generateDBSchema({
  migrationFile,
  schemaFile,
}: IOptions) {
  const dataDir = `memory://${generateId()}`;
  const { dialect } = new KyselyPGlite({ dataDir });
  const db = new Kysely({ dialect });

  try {
    const migration = (await import(migrationFile)) as Migration;
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
    print: true,
  });

  console.log(`Types generated at ${schemaFile}`);
}
