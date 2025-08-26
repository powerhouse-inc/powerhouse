import type { DriveEditorModule } from "@powerhousedao/reactor-browser";
import type { DocumentModelModule, EditorModule, Manifest } from "document-model";
import * as documentModelsExports from './document-models/index.js';
import * as editorsExports from './editors/index.js';
import manifestJson from "./powerhouse.manifest.json" with { type: "json" };

export const manifest: Manifest = manifestJson;
export const documentModels: DocumentModelModule<any>[] = Object.values(documentModelsExports);
export const editors:(EditorModule | DriveEditorModule)[] = Object.values(editorsExports);
