import type { DocumentModelModule } from "document-model";
import { AppModule } from "./app-module/module.js";
import { DocumentEditor } from "./document-editor/module.js";
import { ProcessorModule } from "./processor-module/module.js";
import { SubgraphModule } from "./subgraph-module/module.js";
import { VetraPackage } from "./vetra-package/module.js";

export const documentModels: DocumentModelModule<any>[] = [
  AppModule,
  DocumentEditor,
  ProcessorModule,
  SubgraphModule,
  VetraPackage,
];
