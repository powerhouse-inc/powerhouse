/**
 * What DevTools reads about a project and its running stack, as its API
 * answers it.
 */

/** The project a dev server runs and where the parts of its stack answer.
 * A part the server does not know about is null. */
export type DevStackInfo = {
  project: { name: string | null; version: string | null };
  /** The tool that runs the dev server, the `ph` CLI as a rule. */
  ph: { version: string };
  /** Where the app the dev server serves answers. */
  app: { url: string | null };
  /** The Switchboard's GraphQL endpoint, when `ph vetra` started one. */
  switchboard: { url: string | null };
  mcp: { url: string | null };
  /** When `ph vetra` came up, as an ISO timestamp. */
  startedAt: string | null;
};

/** A file of the project, as a POSIX path relative to the project root. */
export type ProjectFile = { path: string };

export type ProjectCheckId =
  | "registered"
  | "manifest"
  | "document-types"
  | "definition";

/** One fact verified about a module's code. */
export type ProjectCheck = {
  id: ProjectCheckId;
  state: "pass" | "warn" | "fail";
  /** A full sentence without the final period, for example
   * `Registered in editors/editors.ts`. */
  label: string;
  /** What to do about a check that did not pass. */
  detail?: string;
};

/** A part of the project that was read, or the reason it could not be. */
export type ProjectSection<T> =
  | { ok: true; items: T[] }
  | { ok: false; message: string };

export type ProjectModuleKind =
  | "document-model"
  | "editor"
  | "app"
  | "subgraph"
  | "processor";

/**
 * How a document model or a subgraph is authored.
 * `legacy`: a legacy document model, which stores a `<name>.json`
 * specification, or a legacy subgraph, which is anything but a class that
 * extends `Subgraph`.
 */
export type ProjectAuthoring = "current" | "legacy";

export type ProjectDocumentModel = {
  documentType: string;
  name: string;
  extension: string;
  description: string;
  author: string;
  /** The author's website as the model states it. Null when it states none. */
  authorWebsite: string | null;
  authoring: ProjectAuthoring;
  /** The specification file or the entry module. */
  source: string;
  folder: string;
  /** Ascending. */
  versions: number[];
  /** Counts of the latest version. */
  modules: number;
  operations: number;
  checks: ProjectCheck[];
};

export type ProjectEditor = {
  id: string;
  name: string;
  folder: string;
  documentTypes: string[];
  checks: ProjectCheck[];
};

export type ProjectApp = ProjectEditor & {
  /** Null when `config.ts` is missing or could not be read. An empty list
   * allows every type. */
  allowedDocumentTypes: string[] | null;
  dragAndDrop: boolean | null;
};

export type ProjectSubgraph = {
  name: string;
  folder: string;
  authoring: ProjectAuthoring;
  /** The SDL and the file it was read from. Null when no SDL can be read from
   * text: always so for a subgraph that is not legacy, whose schema exists
   * only when its module runs. */
  schema: { source: string; file: string } | null;
  /** Field signatures such as `invoiceStats.example(driveId: String!): String`. */
  queries: string[];
  mutations: string[];
  checks: ProjectCheck[];
};

export type ProjectProcessor = {
  name: string;
  folder: string;
  /** Null when the code does not say. */
  type: "analytics" | "relationalDb" | null;
  apps: ("connect" | "switchboard")[];
  documentTypes: string[];
  checks: ProjectCheck[];
};

export type ProjectDiagnostic = {
  severity: "error" | "warning";
  code?: string;
  message: string;
  /** The file it is about, when known. */
  file?: string;
  repair?: string;
};

/** Every module in the project's code. */
export type ProjectSnapshot = {
  /** Changes whenever a module's files change. Also the response's `ETag`. */
  revision: string;
  /** Absolute path of the project. */
  root: string;
  documentModels: ProjectSection<ProjectDocumentModel>;
  editors: ProjectSection<ProjectEditor>;
  apps: ProjectSection<ProjectApp>;
  subgraphs: ProjectSection<ProjectSubgraph>;
  processors: ProjectSection<ProjectProcessor>;
  /** What no one module's checks carry: findings of the document model
   * checks that are not an error of a listed model, and modules whose code
   * could not be read. A listed model's errors are in its `definition` check. */
  diagnostics: ProjectDiagnostic[];
};

export type ProjectStateScope = {
  schema: string;
  /** JSON text. */
  initialValue: string;
};

export type ProjectOperation = {
  id: string;
  name: string;
  scope: "global" | "local";
  description: string;
  /** The input's SDL. Empty when the operation takes none. */
  schema: string;
  errors: { name: string; code: string; description: string }[];
  /** JSON text of each example input. */
  examples: string[];
};

export type ProjectDocumentModelVersion = {
  version: number;
  changeLog: string[];
  state: { global: ProjectStateScope; local: ProjectStateScope | null };
  modules: {
    id: string;
    name: string;
    description: string;
    operations: ProjectOperation[];
  }[];
};

/** One document model in full. */
export type ProjectDocumentModelDetail = ProjectDocumentModel & {
  revision: string;
  /** Ascending by version. */
  specifications: ProjectDocumentModelVersion[];
};

export type ProjectModuleFiles = {
  folder: string;
  /** Sorted by path. */
  files: ProjectFile[];
};

/** The files of each editor, drive app, subgraph and
 * processor. */
export type ProjectFileList = {
  revision: string;
  modules: ProjectModuleFiles[];
};

/** The text of one file that the file list
 * lists. `path` is escaped as one segment. */
export type ProjectFileText = {
  revision: string;
  path: string;
  /** Up to the server's limit, cut where a character starts. */
  text: string;
  /** The file goes on past `text`. */
  truncated: boolean;
};

/**
 * A read-only view of a project's modules, as its code has them. Each answer
 * carries the revision it was read at.
 */
export type ProjectReader = {
  /** Cheap: asked before every answer, so an unchanged project costs no read. */
  revision: () => string | Promise<string>;
  snapshot: () => Promise<ProjectSnapshot>;
  /** Undefined when the project has no model of that type. */
  documentModel: (
    documentType: string,
  ) => Promise<ProjectDocumentModelDetail | undefined>;
  fileList: () => Promise<ProjectFileList>;
  /** Undefined for a path `fileList` does not list. */
  file: (path: string) => Promise<ProjectFileText | undefined>;
};
