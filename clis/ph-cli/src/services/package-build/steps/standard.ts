import { browserBundleStep, nodeBundleStep } from "./bundles.js";
import { connectRoutesStep } from "./connect-routes.js";
import type { StandardBuildStep } from "./context.js";
import { definitionsStep } from "./definitions.js";
import { manifestNameStep, piecesOutDirStep } from "./package-checks.js";
import { distManifestStep, offeredRoutesStep, piecesStep } from "./pieces.js";
import { releaseApprovalStep, releaseStartStep } from "./release-approval.js";
import { stylesheetStep } from "./stylesheet.js";
import { typecheckStep } from "./typecheck.js";

/**
 * `ph build`'s steps in the order they run. Another phase inserts its own
 * with `[...standardBuildSteps, ...more]` and `after` on the step it follows.
 */
export const standardBuildSteps: readonly StandardBuildStep[] = [
  releaseStartStep,
  manifestNameStep,
  piecesOutDirStep,
  connectRoutesStep,
  typecheckStep,
  definitionsStep,
  browserBundleStep,
  nodeBundleStep,
  piecesStep,
  distManifestStep,
  offeredRoutesStep,
  stylesheetStep,
  releaseApprovalStep,
];
