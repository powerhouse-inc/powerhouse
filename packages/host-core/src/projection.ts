/**
 * @powerhousedao/host-core/projection — platform-neutral projections of a
 * host's blocks onto runtime shapes (switchboard config, Connect runtime config,
 * reactor-monitor descriptors) and the v2 run-record schema. No `node:`
 * import may reach this entry (the build asserts it).
 */

export {
  assertProtocolConsistency,
  browserBackend,
  primaryBackend,
  projectReactorToConnect,
  protocolConflicts,
  protocolEnvAgrees,
  protocolEnv,
  reactorBlockToSwitchboardConfig,
  reactorClientMode,
  type ConnectReactorProjection,
  type ConnectRouterSettings,
  type ReactorClientMode,
  type SwitchboardReactorLayer,
} from "./reactor-config.js";
export {
  backendsToDescriptors,
  backendToDescriptor,
  isStructuralMultiReactor,
  remoteBackendUrls,
  type ProjectedDescriptor,
  type ProjectedStorage,
} from "./backend-projection.js";
export { applyChildWrapper, type MemberDraft } from "./child-wrapper.js";
export {
  mergeDefaultDrives,
  projectDrivesIntoConnect,
  rebaseDriveUrl,
  type DriveProjectionInput,
} from "./connect-projection.js";
export {
  runRecordMemberSchema,
  runRecordSchema,
  type RunRecord,
  type RunRecordMember,
} from "./run-record-schema.js";

// typed-host-configs T3: the output-token resolver (pure; node adapters ship
// from the root entry only).
export * from "./resolve/index.js";

// typed-host-configs T4 lane B: per-host expectations (pure).
export {
  expectHost,
  type ConsumedOutput,
  type ContributedDriveInput,
  type ExpectedBackend,
  type ExpectedDrive,
  type ExpectHostInput,
  type HostExpectation,
  type MemberExpectation,
  type MemberInput,
} from "./expect-host.js";
