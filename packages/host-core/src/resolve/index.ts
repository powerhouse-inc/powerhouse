/**
 * The output-token resolver (typed-host-configs G3, pipeline steps 3–5):
 * declared validation of tokens, the compound dependency plan and
 * `resolveHostOutputs`. Platform-neutral; the node adapters (producer
 * loading, run-record source, process env) are in ./node.ts and ship only
 * from the root entry.
 */

export {
  checkOutputPaths,
  checkTokenSites,
  envSitesOf,
  outputRefsOf,
  outputSitesOf,
  refKey,
  schemaAtPath,
  type DeclaredIssue,
  type OutputRef,
  type OutputsSchemaLookup,
} from "./declared.js";
export {
  memberForRef,
  planCompound,
  PlanError,
  type CompoundPlan,
  type PlanEdge,
  type PlanMember,
} from "./plan.js";
export {
  resolveHostOutputs,
  TokenResolutionError,
  type DeferredResolution,
  type DeferredToken,
  type ResolveOptions,
  type SelfMembers,
  type OutputLookup,
  type OutputSource,
  type ResolveSources,
} from "./resolve.js";
export { findRemovedForms, type RemovedForm } from "./removed-forms.js";
export { compoundOutputSource } from "./sources.js";
export {
  collectTokenSites,
  describeToken,
  formatPath,
  renderTokens,
  unwrapEscapes,
  type TokenPosition,
  type TokenSite,
} from "./walk.js";
