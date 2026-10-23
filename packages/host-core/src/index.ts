/**
 * @powerhousedao/host-core — the uniform-runners host framework.
 *
 * Phase 1 (in progress): the host.js loader and runner resolver move here
 * from ph-cli, followed by the generic compound runner (supervision,
 * instance-fact projection, run records, locks). Plan of record:
 * docs/plans/2026-10-13-uniform-runners.md.
 */

export {
  findNonStaticValue,
  HostLoadError,
  lintHostImports,
  loadHost,
  probeHostsFolder,
  stripComments,
  type HostsFolderStatus,
  type LoadedHost,
} from "./host-loader.js";
export {
  CONNECT_RUNNER,
  getVerb,
  hostSchemaIssues,
  isSchemaLike,
  kindShapeIssues,
  knownVerbIssues,
  listVerbs,
  ONE_SHOT_VERBS,
  resolveRunnerModule,
  RunnerError,
  validateDeclaredHost,
  validateHost,
  type BootCheckContext,
  type BootIssue,
  type DeclaredHostOptions,
  type HostSchemaIssue,
  type HostSchemaIssues,
  type HostSchemaLike,
  type RunnerContext,
  type RunnerIssue,
  type RunnerModule,
  type RunnerVerb,
  type ValidateHostOptions,
} from "./runner-resolver.js";
export {
  clearRunRecord,
  isPidAlive,
  listRunRecords,
  probeRun,
  readProjectName,
  readRunRecord,
  writeRunRecord,
  type RunProbe,
} from "./run-record.js";
export {
  runCompound,
  type RunCompoundOptions,
  type RunCompoundResult,
} from "./compound.js";
export {
  checkHost,
  type CheckDeferred,
  type CheckHostOptions,
  type CheckHostResult,
} from "./check-host.js";
export type { CheckStage, HostIssue } from "./host-issues.js";
export {
  defaultUserDataDir,
  resolveUserDataPlaceholders,
} from "./placeholders.js";
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
export {
  resolveHostPlugins,
  resolvePluginContributions,
  type ContributedDrive,
  type PluginContributionsPlan,
} from "./plugins-resolve.js";
export {
  projectDriveId,
  resolveDriveDeclaration,
  seedDrives,
  mergeDrivePlan,
  explainDrivePlan,
  type ResolvedDrive,
  type DriveSeederClient,
  type SeedResult,
  type DrivePlanEntry,
} from "./drives.js";

// typed-host-configs: the neutral entries, re-exported for node consumers.
export {
  childrenSchema,
  childWrapperSchema,
  compoundHostSchema,
  compoundWiringSchema,
  declaredGenericCompoundHostSchema,
  declaredHostSchemas,
  defineHostSchemas,
  emitHostJsonSchema,
  emittedHostSchemas,
  genericCompoundHostSchema,
  makeHostSchemas,
  profileSchema,
  reactorBackendKindSchema,
  reactorBackendSchema,
  reactorHostSchema,
  reactorProtocolSchema,
  reactorSchema,
  refineStartOrder,
  runnerBaseSchema,
  runnerKindSchema,
  type ChildWrapper,
  type CompoundHost,
  type CompoundHostInput,
  type CompoundWiring,
  type HostDefinition,
  type HostSchemas,
  type Profile,
  type ReactorBackend,
  type ReactorBackendKind,
  type ReactorConfig,
  type ReactorHost,
  type ReactorHostInput,
  type ReactorPackageConfig,
  type ReactorProtocol,
  type ReactorRemoteConfig,
  type ReactorStorageConfig,
  type RunnerBase,
  type RunnerKind,
} from "./host-schemas.js";
export {
  buildDriveDeclarationSchema,
  driveDeclarationSchema,
  drivesSchema,
  projectDriveIdWith,
  type DriveDeclaration,
} from "./drive-schema.js";
export { substituteBuiltinEnv, type BuiltinEnv } from "./env-substitution.js";
export {
  concatTokenSchema,
  envTokenSchema,
  findToken,
  forbidRef,
  isToken,
  itemTokenSchema,
  keyTokenSchema,
  mapTokenSchema,
  outputTokenSchema,
  envTokenable,
  ref,
  tokenable,
  tokenKeyOf,
  tokenSchema,
  TOKEN_ESCAPE_KEY,
  TOKEN_KEYS,
  type ConcatToken,
  type EnvToken,
  type ItemToken,
  type KeyToken,
  type MapToken,
  type OutputPath,
  type OutputToken,
  type RefFn,
  type Token,
  type TokenableSchema,
  type TokenKey,
  type TokenMode,
} from "./tokens.js";
export {
  runnerHandleSchema,
  toStartedHandle,
  type RunnerHandle,
  type RunnerHandleData,
  type StartedHandle,
} from "./runner-handle.js";
export { pluginEntryObjectSchema, type PluginEntryData } from "./plugins.js";
export type { PHHost, PHHostOutputs, PluginEntry } from "./host-types.js";

export {
  assertProtocolConsistency,
  primaryBackend,
  projectReactorToConnect,
  projectReactorToSwitchboard,
  protocolConflicts,
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
export {
  CONNECT_PLUGIN_OWNED_SLICES,
  findDeadConnectConfig,
  type ConnectPluginSlices,
  type DeadConfigWarning,
  type OwnedConfigSlice,
} from "./plugins-resolve.js";

// typed-host-configs T3: the output-token resolver (neutral part, also in
// ./projection) and its node adapters.
export * from "./resolve/index.js";
export {
  loadProducers,
  processResolveEnv,
  producerOutputsSchemas,
  runRecordOutputSource,
  runnerOutputsSchema,
  type ProducerInfo,
  type ProducerMap,
} from "./resolve/node.js";
// typed-host-configs T3 lane C: generated outputs.js (+ `process.` ban).
export {
  computeOutputsHash,
  describeHostOutputs,
  lintHostImportGraph,
  lintOutputsFile,
  OUTPUTS_FILE,
  readOutputsFileHash,
  scanHostImports,
  type HostImports,
  type HostOutputsDescription,
} from "./host-loader.js";

// typed-host-configs T4: $map field typing.
export type {
  ArrayMapToken,
  RecordMapToken,
  Template,
  TokenFor,
} from "./tokens.js";

// typed-host-configs T4 lane B: per-host expectations (fixtures, monitor).
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
