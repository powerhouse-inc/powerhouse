import { POWERHOUSE_CONFIG_FILE } from "@powerhousedao/shared/clis/constants";
import type { DefinitionSource } from "@powerhousedao/shared/document-model";
import { lintSubgraphTypes } from "@powerhousedao/vetra/codegen";
import {
  DefinitionSourceLoader,
  resolveDefinitionSelection,
} from "document-model/tooling";
import { join } from "node:path";
import { ViteTypeScriptSourceImportAdapter } from "../services/definitions/import-adapters.js";
import { packageRevisionOf } from "../services/definitions/package-revision.js";

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/**
 * Prints the subgraph conflicts `ph generate` can see. Problems with the
 * code-first definitions only narrow the check to what still loads, so the
 * schema-first warnings are never lost to them.
 */
export async function warnSubgraphTypeConflicts(
  projectDir: string,
): Promise<void> {
  let codeFirst: Parameters<typeof lintSubgraphTypes>[1];
  try {
    codeFirst = await loadCodeFirst(projectDir);
  } catch (error) {
    console.warn(
      `⚠ Could not load the code-first definitions, so subgraph conflicts with them are not checked: ${errorMessage(error)}`,
    );
  }
  let warnings: string[];
  try {
    warnings = lintSubgraphTypes(projectDir, codeFirst);
  } catch (error) {
    if (codeFirst === undefined) {
      console.warn("⚠ Failed to check subgraph type names:", error);
      return;
    }
    try {
      warnings = lintSubgraphTypes(projectDir);
    } catch (schemaFirstError) {
      console.warn("⚠ Failed to check subgraph type names:", schemaFirstError);
      return;
    }
    console.warn(
      `⚠ Could not check the code-first definitions, so subgraph conflicts with them are not checked: ${errorMessage(error)}`,
    );
  }
  for (const warning of warnings) console.warn(`⚠ ${warning}`);
}

/** The code-first definitions `powerhouse.config.json` selects that load. */
async function loadCodeFirst(
  projectDir: string,
): Promise<Parameters<typeof lintSubgraphTypes>[1]> {
  const selection = { configFile: join(projectDir, POWERHOUSE_CONFIG_FILE) };
  if (resolveDefinitionSelection(selection).status !== "ready") return;
  const loader = new DefinitionSourceLoader(
    new ViteTypeScriptSourceImportAdapter(),
  );
  try {
    const loaded = await loader.normalizeDefinitionSources({
      ...selection,
      packageRevision: packageRevisionOf(projectDir, "dist"),
    });
    const loadedSources = [
      ...loaded.documentModels,
      ...loaded.upgradeManifests,
      ...loaded.subgraphs,
      ...loaded.scalars,
    ].map(({ source }) => source);
    const exportPathOf = ({ exportPath }: DefinitionSource) =>
      (exportPath ?? []).join("/");
    const loadedFrom = (source: DefinitionSource) =>
      loadedSources.some(
        (other) =>
          other.specifier === source.specifier &&
          (source.exportPath === undefined ||
            exportPathOf(other) === exportPathOf(source)),
      );
    const failed = [
      ...new Set(
        loaded.diagnostics.flatMap(({ severity, source }) =>
          severity === "error" && source && !loadedFrom(source)
            ? [
                source.exportPath === undefined
                  ? source.specifier
                  : `${source.specifier}#/${exportPathOf(source)}`,
              ]
            : [],
        ),
      ),
    ].sort();
    if (failed.length > 0) {
      console.warn(
        `⚠ Could not load the code-first definitions in ${failed.join(", ")}, so subgraph conflicts with them are not checked. Run "ph model check" to see why.`,
      );
    }
    return {
      documentModels: loaded.documentModels.map(({ value }) => value),
      subgraphs: loaded.subgraphs,
    };
  } finally {
    await loader.dispose();
  }
}
