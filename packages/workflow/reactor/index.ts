import type { Manifest } from "document-model";
import manifestJson from "../powerhouse.manifest.json" with { type: "json" };

export { documentModels } from "../document-models/document-models.js";
export { upgradeManifests } from "../document-models/upgrade-manifests.js";
export const manifest = manifestJson as Manifest;
