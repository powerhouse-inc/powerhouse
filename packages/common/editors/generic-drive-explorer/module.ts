import { editorId, editorName } from "@powerhousedao/builder-tools";
import { Editor } from "@powerhousedao/common";
import type { EditorModule } from "document-model";
import { editorDocumentTypes } from "./constants.js";

export const GenericDriveExplorer: EditorModule = {
  Component: Editor,
  id: editorId,
  name: editorName,
  documentTypes: editorDocumentTypes,
};
