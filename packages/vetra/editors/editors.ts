import type { EditorModule } from "document-model";
import { AppEditor } from "./app-editor/module.js";
import { DocumentEditor } from "./document-editor/module.js";
import { ProcessorEditor } from "./processor-editor/module.js";
import { SubgraphEditor } from "./subgraph-editor/module.js";
import { VetraDriveApp } from "./vetra-drive-app/module.js";
import { VetraPackageEditor } from "./vetra-package/module.js";

export const editors: EditorModule[] = [
  AppEditor,
  DocumentEditor,
  ProcessorEditor,
  SubgraphEditor,
  VetraDriveApp,
  VetraPackageEditor,
];
