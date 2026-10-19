import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Project } from "ts-morph";
import { getOrCreateSourceFile, projectDirOf } from "utils";
const AI_TOOLS_MODULE_SPECIFIER = "./ai/tools.js";

/**
 * Idempotently syncs the optional `aiTools` export in the project's root
 * `index.ts`: the line is present if and only if `ai/tools.ts` exists.
 * The export is how the host app (Connect) discovers the tool descriptors
 * this package offers to the in-browser AI assistant.
 */
export function syncProjectAiToolsExport(project: Project): void {
  const projectDir = projectDirOf(project);
  const indexPath = join(projectDir, "index.ts");
  if (!existsSync(indexPath)) return;
  const { sourceFile } = getOrCreateSourceFile(project, indexPath);
  const hasAiToolsFile = existsSync(join(projectDir, "ai", "tools.ts"));
  const existing = sourceFile
    .getExportDeclarations()
    .find(
      (declaration) =>
        declaration.getModuleSpecifier()?.getText().trim() ===
          `"${AI_TOOLS_MODULE_SPECIFIER}"` &&
        declaration
          .getNamedExports()
          .some((exported) => exported.getText() === "aiTools"),
    );

  if (hasAiToolsFile && !existing) {
    sourceFile.addExportDeclarations([
      {
        namedExports: ["aiTools"],
        moduleSpecifier: AI_TOOLS_MODULE_SPECIFIER,
      },
    ]);
  } else if (!hasAiToolsFile && existing) {
    existing.remove();
  }
}
