// Wires the ui/ piece-catalog seam to the workflow-runtime subgraph. Imported
// for its side effect by every editor shell that renders block metadata
// (logos come from the catalog, so the studio needs it too).
import {
  fetchPieceActions,
  fetchPieceCatalog,
  fetchPieceTriggers,
  searchBlocks,
} from "./runtime-api.js";
import { registerPieceSource } from "./ui/piece-source.js";

registerPieceSource({
  loadCatalog: fetchPieceCatalog,
  loadActions: fetchPieceActions,
  loadTriggers: fetchPieceTriggers,
  searchBlocks,
});
