export {
  DEVTOOLS_API_PATH,
  DEVTOOLS_PAGE_PATH,
  DEVTOOLS_TOKEN_META,
} from "./paths.js";

export const DEVTOOLS_TOKEN_HEADER = "x-ph-devtools-token";

export type {
  DevStackInfo,
  ProjectApp,
  ProjectCheck,
  ProjectCheckId,
  ProjectDiagnostic,
  ProjectDocumentModel,
  ProjectDocumentModelDetail,
  ProjectDocumentModelVersion,
  ProjectEditor,
  ProjectFile,
  ProjectFileList,
  ProjectFileText,
  ProjectModuleFiles,
  ProjectModuleKind,
  ProjectOperation,
  ProjectProcessor,
  ProjectSection,
  ProjectSnapshot,
  ProjectStateScope,
  ProjectSubgraph,
  ProjectReader,
} from "./project-types.js";

export type DevtoolsApiErrorCode =
  | "bad_host"
  | "bad_origin"
  | "bad_token"
  | "bad_method"
  | "not_found"
  | "internal";

export type DevtoolsApiError = {
  error: { code: DevtoolsApiErrorCode; message: string };
};
