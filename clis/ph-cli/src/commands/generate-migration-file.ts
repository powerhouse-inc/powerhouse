import { debugArgs } from "@powerhousedao/shared/clis/args";
import { command, option, optional, string } from "cmd-ts";
import { skipInstallArgs } from "../utils/install-added-dependencies.js";

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
    ...skipInstallArgs,
    ...debugArgs,
  },
  handler: async (args) => {
    const { startGenerateMigrationFile } =
      await import("../services/generate-migration-file.js");
    await startGenerateMigrationFile(args, process.cwd());
    process.exit(0);
  },
});
