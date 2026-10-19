/**
 * @powerhousedao/host-core/projection — platform-neutral projections of a
 * host's blocks onto runtime shapes (switchboard env, Connect runtime config,
 * reactor-monitor descriptors) and the v2 run-record schema. No `node:`
 * import may reach this entry (the build asserts it).
 */

export {
  assertProtocolConsistency,
  primaryBackend,
  projectReactorToConnect,
  projectReactorToSwitchboard,
  protocolEnv,
  reactorClientMode,
  type ConnectReactorProjection,
  type ReactorClientMode,
  type SwitchboardReactorProjection,
} from "./reactor-config.js";
export {
  backendsToDescriptors,
  backendToDescriptor,
  isStructuralMultiReactor,
  remoteBackendUrls,
  type ProjectedDescriptor,
  type ProjectedStorage,
} from "./backend-projection.js";
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
