import {
  editorDocumentTypes,
  editorId,
  editorName,
} from "@powerhousedao/builder-tools";
import type { EditorModule } from "document-model";
import { Editor } from "./editor.js";

export const module: EditorModule = {
  Component: Editor,
  id: editorId,
  name: editorName,
  documentTypes: editorDocumentTypes,
};

export default module;
