import { debugArgs } from "@powerhousedao/shared/clis/args";
import { command, option, optional, string } from "cmd-ts";
import path from "path";

export const generateMigrationFileCmd = command({
  name: "migration-file",
  description: "Generate a migration file",
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
    const { generateDBSchema } = await import("@powerhousedao/codegen");
    await generateDBSchema({
      migrationFile: path.join(process.cwd(), migrationFile),
      schemaFile: schemaFile ? path.join(process.cwd(), schemaFile) : undefined,
    });
    process.exit(0);
  },
});
