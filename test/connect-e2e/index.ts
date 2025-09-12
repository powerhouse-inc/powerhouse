import type { Manifest } from "document-model";
const documentModelsExports = {};
const editorsExports = {};
import manifestJson from "./powerhouse.manifest.json" with { type: "json" };

export const manifest: Manifest = manifestJson;
