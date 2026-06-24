import { ts } from "@tmpl/core";

export const reactorTsTemplate = ts`
/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { Manifest } from "document-model";
import manifestJson from "../powerhouse.manifest.json" with { type: "json" };
export { documentModels } from "../document-models/document-models.js";
export { upgradeManifests } from "../document-models/upgrade-manifests.js";
export { processorFactory } from "../processors/factory.js";
export const manifest: Manifest = manifestJson;
`.raw;
