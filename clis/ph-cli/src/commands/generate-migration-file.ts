import { generateDBSchema } from "@powerhousedao/codegen";
import { debugArgs } from "@powerhousedao/shared/clis";
import { command, option, optional, string } from "cmd-ts";
import path from "path";

export const generateMigrationFileCmd = command({
  name: "migration-file",
  description: "Generate a a migration file",
  args: {
    migrationFile: option({
      type: string,
      long: "path",
      short: "p",
      description: "Path to the migration file",
    }),
    schemaFile: option({
      type: optional(string),
      long: "schema-file",
      description: "Path to the output file. Defaults to './schema.ts'",
    }),
    ...debugArgs,
  },
  handler: async ({ migrationFile, schemaFile }) => {
    await generateDBSchema({
      migrationFile: path.join(process.cwd(), migrationFile),
      schemaFile: schemaFile ? path.join(process.cwd(), schemaFile) : undefined,
    });
    process.exit(0);
  },
});
