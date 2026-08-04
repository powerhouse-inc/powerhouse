import type { DocumentModelModule, Manifest } from "document-model";
import { documentModels as generatedDocumentModels } from "./document-models/document-models.js";
import { e2eFixtureDocumentModels } from "./e2e-fixtures/sample-note-module.js";
import manifestJson from "./powerhouse.manifest.json" with { type: "json" };
export { editors } from "./editors/editors.js";
export const documentModels: DocumentModelModule<any>[] = [
  ...e2eFixtureDocumentModels,
  ...generatedDocumentModels,
];
export const manifest: Manifest = manifestJson;
