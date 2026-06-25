import { ts } from "@tmpl/core";

export const indexTsTemplate = ts`
/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { Manifest } from "document-model";
import manifestJson from "./powerhouse.manifest.json" with { type: "json" };
export { documentModels } from "./document-models/document-models.js";
export { upgradeManifests } from "./document-models/upgrade-manifests.js";
export { editors } from "./editors/editors.js";
export { processorFactory } from "./processors/factory.js";
export const manifest = manifestJson as Manifest;
`.raw;
