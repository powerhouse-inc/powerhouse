/**
 * @powerhousedao/host-core — the uniform-runners host framework.
 *
 * Phase 1 (in progress): the host.js loader and runner resolver move here
 * from ph-cli, followed by the generic compound runner (supervision,
 * instance-fact projection, run records, locks). Plan of record:
 * docs/plans/2026-10-13-uniform-runners.md.
 */

export {
  mergeDefaultDrives,
  projectDrivesIntoConnect,
  rebaseDriveUrl,
  type DriveProjectionInput,
} from "./connect-projection.js";
export {
  findNonStaticValue,
  HostLoadError,
  lintHostImports,
  loadHost,
  probeHostsFolder,
  type HostDefinition,
  type HostsFolderStatus,
  type LoadedHost,
} from "./host-loader.js";
export {
  getVerb,
  listVerbs,
  resolveRunnerModule,
  RunnerError,
  validateHost,
  type HostSchemaLike,
  type RunnerContext,
  type RunnerModule,
  type RunnerVerb,
} from "./runner-resolver.js";
export {
  clearRunRecord,
  isPidAlive,
  probeRun,
  readRunRecord,
  writeRunRecord,
  type RunProbe,
  type RunRecord,
  type RunRecordMember,
} from "./run-record.js";
export {
  runCompound,
  type CompoundMember,
  type CompoundWiring,
  type RunCompoundOptions,
  type RunCompoundResult,
  type RunnerHandle,
} from "./compound.js";
export {
  defaultUserDataDir,
  resolveUserDataPlaceholders,
} from "./placeholders.js";
export {
  backendsToDescriptors,
  backendToDescriptor,
  isStructuralMultiReactor,
  remoteBackendUrls,
  type ProjectedDescriptor,
} from "./backend-projection.js";
export {
  childrenSchema,
  compoundHostSchema,
  emittedHostSchemas,
  profileSchema,
  reactorHostSchema,
  reactorBackendSchema,
  reactorProtocolSchema,
  reactorSchema,
  runnerBaseSchema,
} from "./host-schemas.js";
export {
  assertProtocolConsistency,
  primaryBackend,
  projectReactorToConnect,
  projectReactorToSwitchboard,
  protocolEnv,
  reactorClientMode,
  type ConnectReactorProjection,
  type ReactorBackend,
  type ReactorClientMode,
  type ReactorConfig,
  type ReactorProtocol,
  type SwitchboardReactorProjection,
} from "./reactor-config.js";

// R1 — the plugin framework + core drive declarations (rewire plan).
export {
  PluginError,
  pluginEntrySchema,
  normalizePluginEntry,
  normalizePluginEntries,
  entryActiveForVerb,
  registerHostType,
  hostTypeSatisfies,
  resolveOrder,
  runProvideHook,
  runTransformHook,
  runObserveHook,
  runObserveHookSequential,
  mergeContributions,
  type PluginEntry,
  type NormalizedPluginEntry,
  type HostPlugin,
  type HostPluginModule,
  type ResolvedPlugin,
  type Contributions,
  type Provide,
  type Transform,
  type Observe,
  type ContributionSource,
  type MergedContribution,
} from "./plugins.js";
export { resolveHostPlugins } from "./plugins-resolve.js";
export {
  driveDeclarationSchema,
  drivesSchema,
  projectDriveId,
  resolveDriveDeclaration,
  seedDrives,
  mergeDrivePlan,
  explainDrivePlan,
  type DriveDeclaration,
  type ResolvedDrive,
  type DriveSeederClient,
  type SeedResult,
  type DrivePlanEntry,
} from "./drives.js";
