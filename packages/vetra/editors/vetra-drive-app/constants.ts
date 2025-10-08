export const editorId = "vetra-drive-app";
export const editorName = "Vetra Drive App";
export const editorDocumentTypes = ["powerhouse/document-drive"];
export const driveDocumentTypes = [
  "powerhouse/document-model",
  "powerhouse/package",
  "powerhouse/document-editor",
  "powerhouse/app",
  "powerhouse/subgraph",
  "powerhouse/processor",
  "powerhouse/codegen-processor",
] as const;

export type DriveDocumentType = (typeof driveDocumentTypes)[number];
