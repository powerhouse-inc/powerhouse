import {
  getBooleanPropertyValue,
  getEditorDirNames,
  getEditorMetadata,
  getProcessorDirNames,
  getProcessorMetadata,
  getProperyAssignmentByName,
  getStringArrayPropertyElements,
  getSubgraphDirNames,
  getSubgraphMetadata,
} from "@powerhousedao/codegen/utils";
import type {
  ProjectApp,
  ProjectAuthoring,
  ProjectDiagnostic,
  ProjectEditor,
  ProjectProcessor,
  ProjectSubgraph,
} from "../../project-types.js";
import { DRIVE_DOCUMENT_TYPES } from "../../drive-types.js";
import { join } from "node:path";
import { type Project, type SourceFile, SyntaxKind } from "ts-morph";
import type { Barrel } from "./barrels.js";
import { byKey } from "./project-fs.js";
import { EDITORS_DIR, PROCESSORS_DIR, SUBGRAPHS_DIR } from "./revision.js";
import { noSchema, readSubgraphSchema } from "./subgraph-schema.js";

type Unchecked<T extends { checks: unknown }> = Omit<T, "checks">;

export type ProjectEditors = {
  editors: Unchecked<ProjectEditor>[];
  apps: Unchecked<ProjectApp>[];
  diagnostics: ProjectDiagnostic[];
};

/**
 * One error for each module that repeats an id an earlier one declared, in
 * the order given. `what` is the kind of id, for example `editor id`.
 */
export function duplicateDiagnostics(
  what: string,
  modules: readonly { id: string; folder: string; file: string }[],
): ProjectDiagnostic[] {
  const first = new Map<string, string>();
  return modules.flatMap(({ id, folder, file }): ProjectDiagnostic[] => {
    const earlier = first.get(id);
    if (earlier === undefined) {
      first.set(id, folder);
      return [];
    }
    return [
      {
        severity: "error",
        message: `${earlier} and ${folder} both declare the ${what} ${id}.`,
        file,
        repair: `Give ${folder} its own ${what}.`,
      },
    ];
  });
}

/** An app's `allowedDocumentTypes`: empty when `config.ts` does not set it,
 * null when there is no `config.ts` or the value is not an array literal. */
function allowedDocumentTypes(config: SourceFile | undefined): string[] | null {
  if (config === undefined) return null;
  const property = getProperyAssignmentByName(config, "allowedDocumentTypes");
  if (property === undefined) return [];
  return property.getInitializerIfKind(SyntaxKind.ArrayLiteralExpression)
    ? getStringArrayPropertyElements(config, "allowedDocumentTypes")
    : null;
}

/**
 * The editors of `editors/`, split into drive apps and the rest. A folder
 * whose `module.ts` does not spell its id, name and document types as
 * literals is reported, because nothing else can be said about it.
 */
export function readEditors(sources: Project, root: string): ProjectEditors {
  const editors: Unchecked<ProjectEditor>[] = [];
  const apps: Unchecked<ProjectApp>[] = [];
  const diagnostics: ProjectDiagnostic[] = [];
  for (const dirName of getEditorDirNames(sources)) {
    const folder = `${EDITORS_DIR}/${dirName}`;
    const metadata = getEditorMetadata(sources, dirName);
    if (metadata === undefined) {
      diagnostics.push({
        severity: "warning",
        message: `${folder}/module.ts does not declare its id, name and documentTypes as literals, so the editor is not listed.`,
        file: `${folder}/module.ts`,
      });
      continue;
    }
    const editor = {
      id: metadata.id,
      name: metadata.name,
      folder,
      documentTypes: metadata.documentTypes,
    };
    if (
      !editor.documentTypes.some((type) => DRIVE_DOCUMENT_TYPES.includes(type))
    ) {
      editors.push(editor);
      continue;
    }
    const config = sources.addSourceFileAtPathIfExists(
      join(root, EDITORS_DIR, dirName, "config.ts"),
    );
    apps.push({
      ...editor,
      allowedDocumentTypes: allowedDocumentTypes(config),
      dragAndDrop:
        getBooleanPropertyValue(config, "isDragAndDropEnabled") ?? null,
    });
  }
  diagnostics.push(
    ...duplicateDiagnostics(
      "editor id",
      [...editors, ...apps]
        .sort(byKey(({ folder }) => folder))
        .map(({ id, folder }) => ({ id, folder, file: `${folder}/module.ts` })),
    ),
  );
  // The sorts are stable, so modules that share an id stay in folder order.
  return {
    editors: editors.sort(byKey(({ id }) => id)),
    apps: apps.sort(byKey(({ id }) => id)),
    diagnostics,
  };
}

/** What a processor's own file says it is, by the marker it imports. Null when it imports neither. */
function processorType(
  sources: Project,
  root: string,
  dirName: string,
): ProjectProcessor["type"] {
  const file = ["processor.ts", "index.ts"]
    .map((name) =>
      sources.addSourceFileAtPathIfExists(
        join(root, PROCESSORS_DIR, dirName, name),
      ),
    )
    .find((candidate) => candidate !== undefined);
  const imported = new Set(
    file
      ?.getImportDeclarations()
      .flatMap((declaration) => declaration.getNamedImports())
      .map((specifier) => specifier.getName()),
  );
  if (imported.has("RelationalDbProcessor")) return "relationalDb";
  return imported.has("IAnalyticsStore") ? "analytics" : null;
}

/** The processors of `processors/`. `apps` names the hosts whose factory builders file imports the processor. */
export function readProcessors(
  sources: Project,
  root: string,
  hosts: Record<ProjectProcessor["apps"][number], Barrel>,
): Unchecked<ProjectProcessor>[] {
  return getProcessorDirNames(sources)
    .map((dirName) => {
      const folder = `${PROCESSORS_DIR}/${dirName}`;
      return {
        name: dirName,
        folder,
        type: processorType(sources, root, dirName),
        apps: (["connect", "switchboard"] as const).filter((host) =>
          hosts[host].references(folder),
        ),
        documentTypes: getProcessorMetadata(sources, dirName).documentTypes,
      };
    })
    .sort(byKey(({ name }) => name));
}

export function readSubgraphs(
  sources: Project,
  root: string,
): Unchecked<ProjectSubgraph>[] {
  return getSubgraphDirNames(sources)
    .map((dirName) => {
      const { subgraphName, style } = getSubgraphMetadata(sources, dirName);
      const legacy = style === "schema-first";
      const authoring: ProjectAuthoring = legacy ? "legacy" : "current";
      return {
        name: subgraphName ?? dirName,
        folder: `${SUBGRAPHS_DIR}/${dirName}`,
        authoring,
        ...(legacy ? readSubgraphSchema(root, dirName) : noSchema()),
      };
    })
    .sort(byKey(({ name }) => name));
}
