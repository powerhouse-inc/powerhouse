import { ts } from "@tmpl/core";

export const driveEditorConfigFileTemplate = (v: {
  allowedDocumentTypesString: string;
  isDragAndDropEnabledString: string;
}) =>
  ts`
import type { PHDriveEditorConfig } from "@powerhousedao/reactor-browser";

/** Editor config for the <%= pascalCaseDriveEditorName %> */
export const editorConfig: PHDriveEditorConfig = {
  isDragAndDropEnabled: ${v.isDragAndDropEnabledString},
  allowedDocumentTypes: ${v.allowedDocumentTypesString}
};
`.raw;
