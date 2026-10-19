import { lintSubgraphTypes } from "@powerhousedao/vetra/codegen";

export function warnSubgraphTypeConflicts(projectDir: string): void {
  let warnings: string[];
  try {
    warnings = lintSubgraphTypes(projectDir);
  } catch (error) {
    console.warn("⚠ Failed to check subgraph type names:", error);
    return;
  }
  for (const warning of warnings) console.warn(`⚠ ${warning}`);
}
