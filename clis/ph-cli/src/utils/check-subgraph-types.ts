import { lintSubgraphTypes } from "@powerhousedao/vetra/codegen";

export async function checkSubgraphTypes(projectDir: string): Promise<void> {
  let lint: Awaited<ReturnType<typeof lintSubgraphTypes>>;
  try {
    lint = await lintSubgraphTypes(projectDir);
  } catch (error) {
    console.warn("⚠ Failed to check the package's subgraphs:", error);
    return;
  }
  for (const error of lint.errors) console.error(`✘ ${error}`);
  for (const warning of lint.warnings) console.warn(`⚠ ${warning}`);
  if (lint.errors.length > 0) process.exitCode = 1;
}
