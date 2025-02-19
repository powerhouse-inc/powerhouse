import type { Manifest } from "document-model";
import manifestJson from "./powerhouse.manifest.json" assert { type: "json" };
export const manifest: Manifest = manifestJson;
export { documentModelModules } from "./document-models/index.js";
export { editorModules } from "./editors/index.js";
