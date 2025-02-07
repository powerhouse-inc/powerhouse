import type { Manifest } from "document-model/document";
import * as documentModelsExports from "./document-models";
import * as editorsExports from "./editors";
import manifestJson from "./powerhouse.manifest.json" assert { type: "json" };

export const manifest: Manifest = manifestJson;
export * from "./editors/types";

export const documentModels = Object.values(documentModelsExports);
export const editors = Object.values(editorsExports);
