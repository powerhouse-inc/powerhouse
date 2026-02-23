import type { EditorModule } from "document-model";
import { DocumentModelEditor } from "./document-model-editor/module.js";
import { GenericDriveExplorer } from "./generic-drive-explorer/module.js";
export const editors: EditorModule[] = [
  DocumentModelEditor,
  GenericDriveExplorer,
];
