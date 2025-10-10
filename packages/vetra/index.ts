import type {
  DocumentModelModule,
  EditorModule,
  Manifest,
} from "document-model";
import type { AppModulePHState } from "./document-models/app-module/gen/types.js";
import type { DocumentEditorPHState } from "./document-models/document-editor/gen/types.js";
import * as documentModelsExports from "./document-models/index.js";
import type { ProcessorModulePHState } from "./document-models/processor-module/gen/types.js";
import type { SubgraphModulePHState } from "./document-models/subgraph-module/gen/types.js";
import type { VetraPackagePHState } from "./document-models/vetra-package/gen/types.js";
import * as editorsExports from "./editors/index.js";
import manifestJson from "./powerhouse.manifest.json" with { type: "json" };

export const manifest: Manifest = manifestJson;
export const documentModels: (
  | DocumentModelModule<DocumentEditorPHState>
  | DocumentModelModule<VetraPackagePHState>
  | DocumentModelModule<SubgraphModulePHState>
  | DocumentModelModule<ProcessorModulePHState>
  | DocumentModelModule<AppModulePHState>
)[] = Object.values(documentModelsExports);
export const editors: EditorModule[] = Object.values(editorsExports);

export * from "./editors/hooks/useVetraDocument.js";
