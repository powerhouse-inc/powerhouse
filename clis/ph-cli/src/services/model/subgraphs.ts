import { projectSubgraphGraphQL } from "document-model";
import { type DocumentNode, parse, print } from "graphql";
import {
  type ProjectDefinitions,
  readSubgraphDefinitions,
  subgraphCheckInput,
  type SubgraphCheckInput,
  type SubgraphDefinitions,
  type SubgraphHostConflict,
  type SubgraphImportFailure,
  type SubgraphInventoryEntry,
} from "document-model/tooling";
import { statSync } from "node:fs";
import { join } from "node:path";
import type { ProjectModules } from "./project.js";
import { schemaFirstSource } from "./schema-first/sdl-sources.js";
import { scanSubgraphs, SUBGRAPHS_ENTRY } from "./subgraph-gate.js";

const SCALARS_ENTRY = "./scalars/index.ts";

/** A module that hangs on a top-level await must not hang `ph model`. */
const IMPORT_TIMEOUT_MS = 60_000;

export type ProjectSubgraphs = {
  readonly input: SubgraphCheckInput;
  readonly inventory: readonly SubgraphInventoryEntry[];
};

type Imported =
  | { readonly ok: true; readonly namespace: object }
  | { readonly ok: false; readonly failure: SubgraphImportFailure };

async function importModule(
  modules: ProjectModules,
  specifier: `./${string}`,
  packageRoot: string,
  timeoutMs: number,
): Promise<Imported> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new Error(
            `it did not finish loading within ${timeoutMs / 1000} seconds`,
          ),
        ),
      timeoutMs,
    );
    timer.unref();
  });
  try {
    return {
      ok: true,
      namespace: await Promise.race([modules.importModule(specifier), timeout]),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      failure: { specifier, reason: message.replaceAll(packageRoot, ".") },
    };
  } finally {
    clearTimeout(timer);
  }
}

/** The host's admission of the code-first subgraphs, replayed against its built-in subgraphs and the package's document models. */
async function replayHostAdmission(
  { subgraphs }: SubgraphDefinitions,
  artifacts: ProjectDefinitions["artifacts"],
): Promise<readonly SubgraphHostConflict[]> {
  if (subgraphs.length === 0) return [];
  const models = new Map(
    artifacts.map(({ documentType, documentModel }) => [
      documentType,
      documentModel.global,
    ]),
  );
  const { findPackageSubgraphConflicts } =
    await import("@powerhousedao/reactor-api/subgraph-types");
  const { conflicts } = await findPackageSubgraphConflicts(
    subgraphs.map(({ name, definition }) => ({
      name,
      // The host serves the printed projection, parsed again.
      typeDefs: parse(
        print(projectSubgraphGraphQL(definition) as unknown as DocumentNode),
      ),
    })),
    [...models.values()],
  );
  return Array.from(conflicts).flatMap(
    ([subgraph, { nameHeldBy, claims }]): SubgraphHostConflict[] =>
      nameHeldBy === "package"
        ? []
        : [
            {
              subgraph,
              ...(nameHeldBy !== undefined && { nameHeldBy }),
              claims,
            },
          ],
  );
}

const usesPackageScalars = ({ subgraphs }: SubgraphDefinitions) =>
  subgraphs.some(({ definition }) =>
    definition.scalars.some(({ implementation }) =>
      implementation.startsWith("package#"),
    ),
  );

/**
 * `undefined` when the project has no code-first subgraph: then nothing here
 * imports a module, and projects without one keep the reports they had. A
 * module that fails or outlives `timeoutMs` becomes a diagnostic.
 */
export async function readProjectSubgraphs(
  project: Pick<ProjectDefinitions, "packageRoot" | "artifacts">,
  modules: ProjectModules,
  timeoutMs: number = IMPORT_TIMEOUT_MS,
): Promise<ProjectSubgraphs | undefined> {
  const root = project.packageRoot;
  const styles = scanSubgraphs(root);
  if (!styles.hasCodeFirst) return undefined;
  const schemaFirst = styles.schemaFirstUnits.map((dir) =>
    schemaFirstSource(root, dir),
  );
  const subgraphs = await importModule(
    modules,
    SUBGRAPHS_ENTRY,
    root,
    timeoutMs,
  );
  if (!subgraphs.ok) {
    return subgraphCheckInput({
      definitions: { subgraphs: [], diagnostics: [] },
      schemaFirst,
      importFailures: [subgraphs.failure],
    });
  }
  const definitions = readSubgraphDefinitions(subgraphs.namespace, {
    specifier: SUBGRAPHS_ENTRY,
  });
  const hostConflicts = await replayHostAdmission(
    definitions,
    project.artifacts,
  );
  if (!usesPackageScalars(definitions)) {
    return subgraphCheckInput({ definitions, schemaFirst, hostConflicts });
  }
  if (
    !(
      statSync(join(root, SCALARS_ENTRY), {
        throwIfNoEntry: false,
      })?.isFile() ?? false
    )
  ) {
    return subgraphCheckInput({
      definitions,
      schemaFirst,
      hostConflicts,
      scalars: null,
    });
  }
  const scalars = await importModule(modules, SCALARS_ENTRY, root, timeoutMs);
  return subgraphCheckInput(
    scalars.ok
      ? { definitions, schemaFirst, hostConflicts, scalars: scalars.namespace }
      : {
          definitions,
          schemaFirst,
          hostConflicts,
          importFailures: [scalars.failure],
        },
  );
}
