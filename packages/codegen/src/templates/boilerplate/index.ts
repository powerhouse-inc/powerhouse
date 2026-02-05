import { ts } from "@tmpl/core";

export const indexTsTemplate =
  ts`import type { Manifest } from "document-model";
import manifestJson from "./powerhouse.manifest.json" with { type: "json" };
export { documentModels } from "./document-models/document-models.js";
export { upgradeManifests } from "./document-models/upgrade-manifests.js";
export { editors } from "./editors/editors.js";
export const manifest: Manifest = manifestJson;
`.raw;
