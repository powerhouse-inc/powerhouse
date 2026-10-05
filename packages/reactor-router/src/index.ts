/**
 * The multi-reactor ROUTER CLIENT (docs/plans/2026-10-03-multi-reactor.md,
 * "Router client").
 *
 * One `IReactorClient` over a SET of reactors: every operation is aimed at the
 * backend that holds its drive or document, collection-spanning reads are
 * fanned in and merged, and application code holds a single client that never
 * learns there is more than one reactor behind it.
 *
 * Three decisions shape everything here, and all three are settled in the plan:
 *
 * 1. **Placement** is keyed on the drive/collection id through the reactor's
 *    own `bucketFor` FNV-1a convention, filtered first by the stage-2
 *    capability contract, with explicit per-collection overrides winning over
 *    the hash (`placement.ts`, `table.ts`).
 * 2. **Routing is advisory** (agreed decision 4). A backend handed an operation
 *    it does not own refuses with a structured {@link WrongBackendError}; the
 *    router corrects its table and re-aims, bounded. A wrong table costs a
 *    round trip, never a lost or misplaced write (`dispatcher.ts`), and
 *    {@link withOwnershipGuard} is the backend half of that contract
 *    (`guard.ts`).
 * 3. **v1 constraints are enforced and named**, not silently approximated: a
 *    batch never spans reactors, and a relationship WRITE never does either
 *    (reads merge) -- {@link CrossBackendBatchError},
 *    {@link CrossBackendRelationshipError}.
 */

export { RoutingReactorClient } from "./client.js";
export { ATTEMPT, RouteDispatcher, type AttemptOptions } from "./dispatcher.js";
export {
  CrossBackendBatchError,
  CrossBackendRelationshipError,
  FanInPartialFailureError,
  InvalidFanInCursorError,
  isMisroute,
  isOperationNotSupported,
  messageOf,
  MisrouteUnresolvedError,
  misrouteOf,
  NoEligibleBackendError,
  NOT_MISROUTED,
  OPERATION_NOT_SUPPORTED_CODE,
  ReactorOperationNotSupportedError,
  UnknownBackendError,
  WRONG_BACKEND_CODE,
  WRONG_SHARD_CODE,
  WrongBackendError,
  type MisrouteInfo,
  type ReactorOperationNotSupportedDetails,
  type WrongBackendDetails,
} from "./errors.js";
export {
  decodeFanInCursor,
  encodeFanInCursor,
  FAN_IN_CURSOR_PREFIX,
  fanIn,
  isFanInCursor,
  mergePaged,
  pagedParticipants,
  type BackendCursor,
  type FanInMode,
  type FanInOptions,
  type MergePagedOptions,
  type PagedParticipant,
} from "./fan-in.js";
export { withOwnershipGuard, type OwnershipGuardOptions } from "./guard.js";
// The capability contract a backend is built against. It is defined in
// @powerhousedao/reactor-monitor (the stage-2 contract), but a consumer that
// authors a ReactorBackend needs the type to populate `capabilities`, and it
// should get it from the package that owns the ReactorBackend contract rather
// than reach into the lab-bench package. Type-only, so this re-export adds no
// runtime dependency on reactor-monitor for any consumer (multi-reactor stage
// 4: Connect builds its two backends against this without naming
// reactor-monitor).
export type {
  ReactorCapabilities,
  ReactorSyncChannel,
} from "@powerhousedao/reactor-monitor";
export {
  eligibleBackends,
  ineligibleReason,
  placeCollection,
  placeStandalone,
} from "./placement.js";
export { RouterTable } from "./table.js";
export {
  collectionRequirements,
  DEFAULT_BRANCH,
  DEFAULT_DOCUMENT_CACHE_SIZE,
  DEFAULT_JOB_CACHE_SIZE,
  DEFAULT_MISROUTE_ATTEMPTS,
  DEFAULT_SUBSCRIPTION_DEDUP_SIZE,
  NO_REQUIREMENTS,
  type CollectionRequirements,
  type CollectionRequirementsInput,
  type ReactorBackend,
  type RouteSource,
  type RouterDiagnostic,
  type RouterTableEntry,
  type RouterTableSnapshot,
  type RoutingOptions,
} from "./types.js";
export { ReactorRouterVersion } from "./version.js";
