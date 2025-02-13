import type { Manifest } from "document-model";
export * from "./document-models/index.js";
import manifestJson from "./powerhouse.manifest.json" assert { type: "json" };
export const manifest: Manifest = manifestJson;
export * from "./editors/index.js";

export * as documentModels from "./document-models/index.js";
export * as editors from "./editors/index.js";
