import { subgraphDirStyles } from "@powerhousedao/codegen/utils";
import { statSync } from "node:fs";
import { join } from "node:path";

export const SUBGRAPHS_ENTRY = "./subgraphs/index.ts";

export type SubgraphStyles = {
  readonly hasCodeFirst: boolean;
  readonly schemaFirstUnits: readonly string[];
};

/** A project without `subgraphs/index.ts` serves no subgraph, so it has none. */
export function scanSubgraphs(projectRoot: string): SubgraphStyles {
  const entry = join(projectRoot, SUBGRAPHS_ENTRY);
  if (!(statSync(entry, { throwIfNoEntry: false })?.isFile() ?? false))
    return { hasCodeFirst: false, schemaFirstUnits: [] };
  const dirs = subgraphDirStyles(join(projectRoot, "subgraphs"));
  return {
    hasCodeFirst: dirs.some(({ style }) => style === "code-first"),
    schemaFirstUnits: dirs
      .filter(({ style }) => style === "schema-first")
      .map(({ dirName }) => dirName),
  };
}

export const hasCodeFirstSubgraph = (projectRoot: string) =>
  scanSubgraphs(projectRoot).hasCodeFirst;
