// Main entry point for switchboard-e2e package
// This file is required by the reactor/switchboard package manager
// to load document models, editors, processors, and subgraphs

import type { Manifest } from "document-model";
import manifestJson from "./powerhouse.manifest.json" with { type: "json" };

export { documentModels } from "./document-models/document-models.js";
export const manifest: Manifest = manifestJson;
