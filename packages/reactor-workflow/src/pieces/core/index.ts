// The built-in core piece: branching, assertions, waits, and the triggers that
// belong to no service. The runtime registers it and always runs this copy.
import { createPiece, PieceCategory } from "@powerhousedao/pieces-framework";
import { CORE_PIECE_NAME } from "@powerhousedao/pieces-framework/workflow";
import { assertAction, branchAction } from "./actions.js";
import { loopAction, routerAction } from "./flow.js";
import { manualTrigger, scheduleTrigger, webhookTrigger } from "./triggers.js";
import { approvalAction, delayAction } from "./waits.js";
import { stopAction, waitForWebhookAction } from "./responses.js";
import { CORE_PIECE_VERSION } from "./version.js";

export { CORE_PIECE_NAME, CORE_PIECE_VERSION };
export * from "./branch-operators.js";
export { evaluateRouter, loopItems, LoopItemsError } from "./flow.js";
export { isPorted, type PortedAction, type PropHints } from "./hints.js";
export * from "./context.js";
export { approvalDecision, durationMs } from "./waits.js";
export { configuredResponse, RESUME_URL_HEADER } from "./responses.js";

export const corePiece = createPiece({
  displayName: "Core",
  description:
    "The engine's own blocks: branching, routing, loops, assertions, delays, approvals, " +
    "stopping and webhook replies, and the triggers that belong to no service.",
  logoUrl: "",
  authors: ["powerhouse"],
  auth: undefined,
  categories: [PieceCategory.CORE],
  actions: [
    branchAction,
    routerAction,
    loopAction,
    assertAction,
    delayAction,
    approvalAction,
    stopAction,
    waitForWebhookAction,
  ],
  triggers: [scheduleTrigger, webhookTrigger, manualTrigger],
});
