import { buildTsMorphProject } from "@powerhousedao/codegen/utils";
import type {
  ProjectCheck,
  ProjectDocumentModelDetail,
  ProjectFileList,
  ProjectFileText,
  ProjectSection,
  ProjectSnapshot,
} from "../../project-types.js";
import { kebabCase } from "change-case";
import { readBarrel } from "./barrels.js";
import {
  definitionCheck,
  documentTypesCheck,
  manifestCheck,
  readManifest,
  registeredCheck,
} from "./checks.js";
import { type ProjectModels, readProjectModels } from "./models.js";
import {
  duplicateDiagnostics,
  readEditors,
  readProcessors,
  readSubgraphs,
} from "./modules.js";
import {
  listFiles,
  projectRelativeMessage,
  readTextWithin,
} from "./project-fs.js";
import {
  documentModelsDirOf,
  EDITORS_DIR,
  PROCESSORS_DIR,
  SUBGRAPHS_DIR,
} from "./revision.js";

/** One read of the project, at one revision. Plain data: it keeps nothing of the readers alive. */
export type ProjectBuild = {
  snapshot: ProjectSnapshot;
  documentModel: (
    documentType: string,
  ) => ProjectDocumentModelDetail | undefined;
  fileList: () => ProjectFileList;
  /** The text of a file `fileList` lists, read when asked. Undefined for any
   * other path. */
  file: (path: string) => ProjectFileText | undefined;
  /** Absolute paths of the modules the document models evaluated. */
  importedFiles: string[];
  /** False when a section failed or a model source did not import. What
   * that depends on can be outside the files the revision is made from. */
  settled: boolean;
  /** False when the document models are what is not settled: only then
   * does reading again mean loading them again. */
  modelsSettled: boolean;
};

/** The most of one file's text an answer carries. */
export const FILE_TEXT_LIMIT = 256 * 1024;

type Read<T> = { ok: true; value: T } | { ok: false; message: string };

const section = <T, Item>(
  read: Read<T>,
  items: (value: T) => Item[],
): ProjectSection<Item> =>
  read.ok
    ? { ok: true, items: items(read.value) }
    : { ok: false, message: read.message };

const itemsOf = <Item>(read: ProjectSection<Item>) =>
  read.ok ? read.items : [];

const failed = (root: string, error: unknown) => ({
  ok: false as const,
  message: projectRelativeMessage(root, error),
});

/**
 * Reads the sections that come from TypeScript sources and joins them with
 * the models into the snapshot. A section that cannot be read answers with
 * the reason, and the others still answer. The ts-morph project lives only
 * for this call.
 */
function readSnapshot(
  root: string,
  revision: string,
  models: Read<ProjectModels>,
): ProjectSnapshot {
  const attempt = <T>(read: () => T): Read<T> => {
    try {
      return { ok: true, value: read() };
    } catch (error) {
      return failed(root, error);
    }
  };

  const documentModelsDir = models.ok
    ? models.value.documentModelsDir
    : documentModelsDirOf(root);
  /** Unknown when the models could not be read, so no type is called missing. */
  const projectTypes = models.ok
    ? new Set(models.value.models.map(({ summary }) => summary.documentType))
    : undefined;
  const documentTypes = (types: string[] | null): ProjectCheck[] =>
    projectTypes === undefined || types === null || types.length === 0
      ? []
      : [documentTypesCheck(types, projectTypes)];

  const manifest = readManifest(root);
  const modelsBarrel = readBarrel(
    root,
    `${documentModelsDir}/document-models.ts`,
  );
  const editorsBarrel = readBarrel(root, `${EDITORS_DIR}/editors.ts`);
  const subgraphsBarrel = readBarrel(root, `${SUBGRAPHS_DIR}/index.ts`);
  const processorHosts = {
    connect: readBarrel(root, `${PROCESSORS_DIR}/connect.ts`),
    switchboard: readBarrel(root, `${PROCESSORS_DIR}/switchboard.ts`),
  };

  // One set of parsed sources for the three readers. Without a tsconfig.json
  // there is none, and each of their sections says so.
  const sources = attempt(() => buildTsMorphProject(root));
  const withSources = <T>(
    read: (project: ReturnType<typeof buildTsMorphProject>) => T,
  ): Read<T> => (sources.ok ? attempt(() => read(sources.value)) : sources);
  const editors = withSources((project) => readEditors(project, root));
  const processors = withSources((project) =>
    readProcessors(project, root, processorHosts),
  );
  const subgraphs = withSources((project) => readSubgraphs(project, root));

  return {
    revision,
    root,
    documentModels: section(models, (value) =>
      value.models.map(({ summary, errors }) => ({
        ...summary,
        checks: [
          registeredCheck("document-model", summary.folder, [modelsBarrel]),
          manifestCheck(manifest, "document-model", {
            id: summary.documentType,
            name: summary.name,
          }),
          definitionCheck(errors),
        ],
      })),
    ),
    editors: section(editors, (value) =>
      value.editors.map((editor) => ({
        ...editor,
        checks: [
          registeredCheck("editor", editor.folder, [editorsBarrel]),
          manifestCheck(manifest, "editor", editor),
          ...documentTypes(editor.documentTypes),
        ],
      })),
    ),
    apps: section(editors, (value) =>
      value.apps.map((app) => ({
        ...app,
        checks: [
          registeredCheck("app", app.folder, [editorsBarrel]),
          manifestCheck(manifest, "app", app),
          ...documentTypes(app.allowedDocumentTypes),
        ],
      })),
    ),
    subgraphs: section(subgraphs, (value) =>
      value.map((subgraph) => ({
        ...subgraph,
        checks: [
          registeredCheck("subgraph", subgraph.folder, [subgraphsBarrel]),
          manifestCheck(manifest, "subgraph", {
            id: kebabCase(subgraph.name),
          }),
        ],
      })),
    ),
    processors: section(processors, (value) =>
      value.map((processor) => ({
        ...processor,
        checks: [
          registeredCheck(
            "processor",
            processor.folder,
            Object.values(processorHosts),
          ),
          manifestCheck(manifest, "processor", { id: processor.name }),
          ...documentTypes(processor.documentTypes),
        ],
      })),
    ),
    diagnostics: [
      ...(models.ok ? models.value.diagnostics : []),
      ...(editors.ok ? editors.value.diagnostics : []),
      ...(subgraphs.ok
        ? duplicateDiagnostics(
            "subgraph name",
            subgraphs.value.map(({ name, folder }) => ({
              id: name,
              folder,
              file: `${folder}/index.ts`,
            })),
          )
        : []),
    ],
  };
}

/** The answers of one read. The file lists are read on first use and kept. */
function projectBuild(
  root: string,
  snapshot: ProjectSnapshot,
  models: Read<ProjectModels>,
): ProjectBuild {
  const { revision } = snapshot;
  const details = new Map<string, ProjectDocumentModelDetail | undefined>();
  let fileList: ProjectFileList | undefined;

  const readDetail = (documentType: string) => {
    const summary = itemsOf(snapshot.documentModels).find(
      (model) => model.documentType === documentType,
    );
    const model =
      models.ok &&
      models.value.models.find(
        (candidate) => candidate.summary.documentType === documentType,
      );
    if (summary === undefined || !model) return undefined;
    return {
      ...summary,
      revision,
      specifications: model.specifications,
    };
  };
  const readFileList = (): ProjectFileList => ({
    revision,
    modules: [
      ...itemsOf(snapshot.editors),
      ...itemsOf(snapshot.apps),
      ...itemsOf(snapshot.subgraphs),
      ...itemsOf(snapshot.processors),
    ].map(({ folder }) => ({
      folder,
      files: listFiles(root, folder).map((path) => ({ path })),
    })),
  });
  const fileListOf = () => (fileList ??= readFileList());

  return {
    snapshot,
    documentModel: (documentType) => {
      if (!details.has(documentType)) {
        details.set(documentType, readDetail(documentType));
      }
      return details.get(documentType);
    },
    fileList: fileListOf,
    file: (path) => {
      const listed = fileListOf().modules.some((module) =>
        module.files.some((file) => file.path === path),
      );
      if (!listed) return undefined;
      const read = readTextWithin(root, path, FILE_TEXT_LIMIT);
      return read && { revision, path, ...read };
    },
    importedFiles: models.ok ? models.value.importedFiles : [],
    modelsSettled: models.ok && !models.value.importFailed,
    settled:
      !(models.ok && models.value.importFailed) &&
      [
        snapshot.documentModels,
        snapshot.editors,
        snapshot.apps,
        snapshot.subgraphs,
        snapshot.processors,
      ].every(({ ok }) => ok),
  };
}

export type ProjectBuilder = (
  revision: string,
  modelsKey: string,
  signal: AbortSignal,
) => Promise<ProjectBuild>;

/**
 * Builds the project's answers, one revision at a time. The read of the
 * document models is kept under `modelsKey`, so a change that leaves the
 * models' inputs alone does not load them again. Nothing is written.
 */
export function createProjectBuilder(root: string): ProjectBuilder {
  let kept: { key: string; models: Read<ProjectModels> } | undefined;
  return async (revision, modelsKey, signal) => {
    if (kept?.key !== modelsKey) {
      const models: Read<ProjectModels> = await readProjectModels(
        root,
        signal,
      ).then(
        (value) => ({ ok: true as const, value }),
        (error: unknown) => failed(root, error),
      );
      // A stopped read failed because it was stopped, which says nothing
      // about the project.
      signal.throwIfAborted();
      kept = { key: modelsKey, models };
    }
    return projectBuild(
      root,
      readSnapshot(root, revision, kept.models),
      kept.models,
    );
  };
}
