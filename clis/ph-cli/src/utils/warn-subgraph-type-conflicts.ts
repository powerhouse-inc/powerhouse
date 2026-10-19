import { lintSubgraphTypes } from "@powerhousedao/vetra/codegen";

export async function warnSubgraphTypeConflicts(
  projectDir: string,
): Promise<void> {
  let warnings: string[];
  try {
    warnings = await lintSubgraphTypes(projectDir);
  } catch (error) {
    console.warn("⚠ Failed to check subgraph type names:", error);
    return;
  }
  for (const warning of warnings) console.warn(`⚠ ${warning}`);
}
