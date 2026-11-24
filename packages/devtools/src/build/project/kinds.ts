import type {
  ProjectApp,
  ProjectCheck,
  ProjectDocumentModel,
  ProjectEditor,
  ProjectModuleKind,
  ProjectProcessor,
  ProjectSection,
  ProjectSnapshot,
  ProjectSubgraph,
} from "../../api.js";

type ModuleKindInfo = {
  panel: string;
  noun: string;
  title: string;
  about: string;
  /** The command that creates one. */
  command: string;
};

export const MODULE_KINDS: Record<ProjectModuleKind, ModuleKindInfo> = {
  "document-model": {
    panel: "models",
    noun: "document model",
    title: "Document models",
    about:
      "A document model defines a document type: its state and the operations that change it.",
    command: "ph generate document-model --name <name>",
  },
  editor: {
    panel: "editors",
    noun: "editor",
    title: "Editors",
    about: "An editor renders the documents of one document model in Connect.",
    command: "ph generate editor --name <name> --document-type <type>",
  },
  app: {
    panel: "apps",
    noun: "drive app",
    title: "Drive Apps",
    about:
      "A drive app lays out a drive and chooses which document types it can hold.",
    command: "ph generate app --name <name>",
  },
  subgraph: {
    panel: "subgraphs",
    noun: "subgraph",
    title: "Subgraphs",
    about:
      "A subgraph adds GraphQL queries and mutations to Switchboard at /graphql/<name>.",
    command: "ph generate subgraph --name <name>",
  },
  processor: {
    panel: "build-processors",
    noun: "processor",
    title: "Processors",
    about:
      "A processor reacts to operations on chosen document types and keeps analytics or relational tables.",
    command: "ph generate processor --name <name>",
  },
};

export const MODULE_KIND_ORDER = Object.keys(
  MODULE_KINDS,
) as ProjectModuleKind[];

/** A module of any kind under the id its page and links to it use: the
 * document type, the editor or app id, or the subgraph or processor name. */
export type ProjectModule = { id: string; name: string } & (
  | { kind: "document-model"; module: ProjectDocumentModel }
  | { kind: "editor"; module: ProjectEditor }
  | { kind: "app"; module: ProjectApp }
  | { kind: "subgraph"; module: ProjectSubgraph }
  | { kind: "processor"; module: ProjectProcessor }
);

function mapSection<T, M>(
  section: ProjectSection<T>,
  toModule: (item: T) => M,
): ProjectSection<M> {
  return section.ok
    ? { ok: true, items: section.items.map(toModule) }
    : section;
}

export function projectModules<K extends ProjectModuleKind>(
  snapshot: ProjectSnapshot,
  kind: K,
): ProjectSection<Extract<ProjectModule, { kind: K }>>;
export function projectModules(
  snapshot: ProjectSnapshot,
  kind: ProjectModuleKind,
): ProjectSection<ProjectModule> {
  switch (kind) {
    case "document-model":
      return mapSection(snapshot.documentModels, (module) => ({
        kind,
        id: module.documentType,
        name: module.name,
        module,
      }));
    case "editor":
      return mapSection(snapshot.editors, (module) => ({
        kind,
        id: module.id,
        name: module.name,
        module,
      }));
    case "app":
      return mapSection(snapshot.apps, (module) => ({
        kind,
        id: module.id,
        name: module.name,
        module,
      }));
    case "subgraph":
      return mapSection(snapshot.subgraphs, (module) => ({
        kind,
        id: module.name,
        name: module.name,
        module,
      }));
    case "processor":
      return mapSection(snapshot.processors, (module) => ({
        kind,
        id: module.name,
        name: module.name,
        module,
      }));
  }
}

const itemsOf = <T>(section: ProjectSection<T>): T[] =>
  section.ok ? section.items : [];

export function findDocumentModel(
  snapshot: ProjectSnapshot,
  documentType: string,
): ProjectDocumentModel | undefined {
  return itemsOf(snapshot.documentModels).find(
    (model) => model.documentType === documentType,
  );
}

export type CheckState = ProjectCheck["state"];

const SEVERITY: Record<CheckState, number> = { pass: 0, warn: 1, fail: 2 };

/** Undefined for a module without checks. */
export function worstCheck(
  checks: readonly ProjectCheck[],
): CheckState | undefined {
  let worst: CheckState | undefined;
  for (const { state } of checks) {
    if (worst === undefined || SEVERITY[state] > SEVERITY[worst]) worst = state;
  }
  return worst;
}

export const problemsOf = (checks: readonly ProjectCheck[]): ProjectCheck[] =>
  checks.filter((check) => check.state !== "pass");
