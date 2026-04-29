import { ts } from "@tmpl/core";

export const appConfigFileTemplate = (v: {
  allowedDocumentTypesString: string;
  isDragAndDropEnabledString: string;
}) =>
  ts`
import type { PHAppConfig } from "@powerhousedao/reactor-browser";

export const editorConfig: PHAppConfig = {
  isDragAndDropEnabled: ${v.isDragAndDropEnabledString},
  allowedDocumentTypes: ${v.allowedDocumentTypesString}
};
`.raw;
