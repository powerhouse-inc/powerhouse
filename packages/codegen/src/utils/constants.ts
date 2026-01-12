/** Document model metadata for the `powerhouse/document-model` document type.
 *
 * Assumed to always be present during codegen.
 */
export const documentModelDocumentTypeMetadata = {
  documentModelId: "powerhouse/document-model",
  documentModelDocumentTypeName: "DocumentModelDocument",
  documentModelDirName: "document-model",
  documentModelImportPath: "document-model",
} as const;

export const VERSIONED_DEPENDENCIES = [
  "@powerhousedao/common",
  "@powerhousedao/design-system",
  "@powerhousedao/vetra",
  "@powerhousedao/builder-tools",
  "document-model",
];

export const VERSIONED_DEV_DEPENDENCIES = [
  "@powerhousedao/codegen",
  "@powerhousedao/config",
  "@powerhousedao/ph-cli",
  "@powerhousedao/reactor-api",
  "@powerhousedao/reactor-browser",
  "@powerhousedao/reactor-local",
  "@powerhousedao/switchboard",
  "@powerhousedao/connect",
  "document-drive",
];
