// The built-in core piece: branching, assertions, and the triggers that belong
// to no service. The runtime registers it itself and always runs this copy.
import { createPiece, PieceCategory } from "@powerhousedao/pieces-framework";
import { CORE_PIECE_NAME } from "@powerhousedao/pieces-framework/workflow";
import { assertAction, branchAction } from "./actions.js";
import { manualTrigger, scheduleTrigger, webhookTrigger } from "./triggers.js";
import { CORE_PIECE_VERSION } from "./version.js";

export { CORE_PIECE_NAME, CORE_PIECE_VERSION };
export * from "./branch-operators.js";
export { isPorted, type PortedAction, type PropHints } from "./hints.js";

export const corePiece = createPiece({
  displayName: "Core",
  description:
    "The engine's own blocks: branching, assertions, and the triggers that " +
    "belong to no service.",
  logoUrl: "",
  authors: ["powerhouse"],
  auth: undefined,
  categories: [PieceCategory.CORE],
  actions: [branchAction, assertAction],
  triggers: [scheduleTrigger, webhookTrigger, manualTrigger],
});
