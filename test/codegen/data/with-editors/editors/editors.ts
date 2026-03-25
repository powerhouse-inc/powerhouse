import type { EditorModule } from "document-model";
import { ExistingDocumentEditor } from "./existing-document-editor/module.js";
import { ExistingDriveEditor } from "./existing-drive-editor/module.js";

export const editors: EditorModule[] = [
  ExistingDocumentEditor,
  ExistingDriveEditor,
];
