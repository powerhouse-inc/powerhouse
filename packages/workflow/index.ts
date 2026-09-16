import type { Manifest } from "document-model";
import manifestJson from "./powerhouse.manifest.json" with { type: "json" };

export { aiTools } from "./ai/tools.js";
export { documentModels } from "./document-models/document-models.js";
export { upgradeManifests } from "./document-models/upgrade-manifests.js";
export { editors } from "./editors/editors.js";
export const manifest = manifestJson as Manifest;
