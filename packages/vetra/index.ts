import type { DriveEditorModule } from "@powerhousedao/reactor-browser";
import type {
  DocumentModelModule,
  EditorModule,
  Manifest,
} from "document-model";
import type { AppModuleDocument } from "./document-models/app-module/index.js";
import type { DocumentEditorDocument } from "./document-models/document-editor/index.js";
import * as documentModelsExports from "./document-models/index.js";
import type { ProcessorModuleDocument } from "./document-models/processor-module/index.js";
import type { SubgraphModuleDocument } from "./document-models/subgraph-module/index.js";
import type { VetraPackageDocument } from "./document-models/vetra-package/index.js";
import * as editorsExports from "./editors/index.js";
import manifestJson from "./powerhouse.manifest.json" with { type: "json" };

export const manifest: Manifest = manifestJson;
export const documentModels: (
  | DocumentModelModule<DocumentEditorDocument>
  | DocumentModelModule<VetraPackageDocument>
  | DocumentModelModule<SubgraphModuleDocument>
  | DocumentModelModule<ProcessorModuleDocument>
  | DocumentModelModule<AppModuleDocument>
)[] = Object.values(documentModelsExports);
export const editors: (EditorModule | DriveEditorModule)[] =
  Object.values(editorsExports);
