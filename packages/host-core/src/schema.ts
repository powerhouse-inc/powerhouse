/**
 * @powerhousedao/host-core/schema — platform-neutral (Node and browser):
 * the zod host schemas and their inferred types, output-token types, `ref()`
 * and `makeHostSchemas`, drive declarations, pure built-in `$env`
 * substitution and the PHHost type map. No `node:` import may reach this
 * entry (the build asserts it).
 */

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
  HOST_NAME_MAX_LENGTH,
  HOST_NAME_MESSAGE,
  HOST_NAME_PATTERN,
  hostNameSchema,
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
export { hostExportSchema, type HostExport } from "./host-export-schema.js";
export {
  driveAddressMessage,
  switchboardOfDrive,
  type SwitchboardDrive,
} from "@powerhousedao/shared/host-tokens";
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
export {
  pluginEntryObjectSchema,
  pluginEntrySchema,
  type PluginEntryData,
} from "./plugins.js";
export type { PHHost, PHHostOutputs, PluginEntry } from "./host-types.js";
export type { CheckStage, HostIssue } from "./host-issues.js";

// typed-host-configs T4: $map field typing.
export type {
  ArrayMapToken,
  RecordMapToken,
  Template,
  TokenFor,
} from "./tokens.js";
