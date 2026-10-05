/**
 * A package generated before the aggregate index re-exported the manifests.
 *
 * The Vite loader falls back to `document-models/upgrade-manifests` when the
 * model subpath carries none, and that fallback is compatibility behaviour
 * this wave must not drop.
 */
export {
  ledgerV1,
  ledgerV2,
  documentModels,
} from "../../document-models/index.js";
