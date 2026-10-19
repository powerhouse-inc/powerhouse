import {
  loadDocumentModelInDir,
  uncachedDefinitionSourceRevision,
  ViteTypeScriptSourceImportAdapter,
} from "@powerhousedao/codegen/utils";
import {
  describeClaimContest,
  describeRefusedDocumentModel,
  describeSubgraphConflict,
  findPackageSubgraphConflicts,
  hostDocumentModels,
  type PackageSubgraph,
  type SubgraphWarning,
} from "@powerhousedao/reactor-api/subgraph-types";
import type { DocumentModelGlobalState } from "@powerhousedao/shared/document-model";
import {
  DefinitionSourceLoader,
  formatDefinitionDiagnostic,
  subgraphEntrySpecifiers,
} from "document-model/tooling";
import type { DocumentNode } from "graphql";
import { type Dirent, readdirSync } from "node:fs";
import { join } from "node:path";

export type SubgraphLint = {
  /** Subgraphs the package cannot ship, such as old-style classes. */
  readonly errors: string[];
  /** Models and subgraphs the server would refuse or leave out. */
  readonly warnings: string[];
};

function directories(path: string): Dirent[] {
  try {
    return readdirSync(path, { withFileTypes: true }).filter((entry) =>
      entry.isDirectory(),
    );
  } catch {
    return [];
  }
}

const line = ({ message, repair }: SubgraphWarning) => `${message} ${repair}`;

/**
 * The schema-first models under `document-models/`. A model file that is not
 * JSON throws, unless `skipUnreadable` leaves that model out.
 */
export function readSchemaFirstModels(
  projectDir: string,
  { skipUnreadable = false }: { readonly skipUnreadable?: boolean } = {},
): DocumentModelGlobalState[] {
  return directories(join(projectDir, "document-models")).flatMap((dir) => {
    try {
      return loadDocumentModelInDir(dir) ?? [];
    } catch (error) {
      if (skipUnreadable) return [];
      throw error;
    }
  });
}

/**
 * Reads the package's subgraphs through the subgraph protocol, without
 * constructing them, and reports what the server would refuse or leave out.
 */
export async function lintSubgraphTypes(
  projectDir: string,
): Promise<SubgraphLint> {
  if (subgraphEntrySpecifiers(projectDir).length === 0) {
    return { errors: [], warnings: [] };
  }
  const loader = new DefinitionSourceLoader(
    new ViteTypeScriptSourceImportAdapter(),
  );
  let read: Awaited<ReturnType<DefinitionSourceLoader["readSubgraphs"]>>;
  try {
    read = await loader.readSubgraphs({
      packageRoot: projectDir,
      packageRevision: uncachedDefinitionSourceRevision(),
    });
  } finally {
    await loader.dispose();
  }

  const errors: string[] = [];
  const warnings: string[] = [];
  for (const diagnostic of read.diagnostics) {
    (diagnostic.severity === "error" ? errors : warnings).push(
      formatDefinitionDiagnostic(diagnostic),
    );
  }
  const subgraphs: PackageSubgraph[] = read.subgraphs.map(
    ({ description }) => ({
      name: description.subgraphName,
      typeDefs: description.typeDefs as DocumentNode,
    }),
  );
  if (subgraphs.length === 0) return { errors, warnings };

  const host = hostDocumentModels(readSchemaFirstModels(projectDir));
  const { conflicts, contests } = findPackageSubgraphConflicts(subgraphs, host);
  warnings.push(
    ...host.refused.map((model) => line(describeRefusedDocumentModel(model))),
    ...Array.from(conflicts).flatMap(([{ name }, conflict]) =>
      describeSubgraphConflict(name, conflict).map(line),
    ),
    ...contests.map((contest) => line(describeClaimContest(contest))),
  );
  return { errors, warnings };
}
