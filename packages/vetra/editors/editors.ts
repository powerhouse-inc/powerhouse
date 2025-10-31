import { VetraPackage } from "../document-models/vetra-package/module.js";
import { AppEditor } from "./app-editor/module.js";
import { DocumentEditor } from "./document-editor/module.js";
import { ProcessorEditor } from "./processor-editor/module.js";
import { SubgraphEditor } from "./subgraph-editor/module.js";
import { VetraDriveApp } from "./vetra-drive-app/module.js";

export const editors = [
  AppEditor,
  DocumentEditor,
  ProcessorEditor,
  SubgraphEditor,
  VetraDriveApp,
  VetraPackage,
];
