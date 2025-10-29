import type { EditorModule, Manifest } from "document-model";
import * as editorsExports from "./editors/index.js";
import manifestJson from "./powerhouse.manifest.json" with { type: "json" };

export const manifest: Manifest = manifestJson;
export { documentModels } from "@powerhousedao/vetra/document-models";
export const editors: EditorModule[] = Object.values(editorsExports);

export * from "./editors/hooks/useVetraDocument.js";
