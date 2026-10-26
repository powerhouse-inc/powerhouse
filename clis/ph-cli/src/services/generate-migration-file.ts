import {
  detectFeatures,
  generateDBSchema,
  syncFeatureDependencies,
} from "@powerhousedao/codegen";
import { resolve } from "node:path";
import type { GenerateMigrationFileArgs } from "../types.js";
import { installAddedDependencies } from "../utils/install-added-dependencies.js";

export async function startGenerateMigrationFile(
  args: Pick<
    GenerateMigrationFileArgs,
    "migrationFile" | "schemaFile" | "skipInstall"
  >,
  projectDir: string,
) {
  const { migrationFile, schemaFile, skipInstall } = args;
  await generateDBSchema({
    migrationFile: resolve(projectDir, migrationFile),
    schemaFile: schemaFile ? resolve(projectDir, schemaFile) : undefined,
  });
  // The schema imports kysely's types.
  const added = await syncFeatureDependencies(
    detectFeatures(projectDir),
    projectDir,
  );
  await installAddedDependencies(added, projectDir, skipInstall);
}
