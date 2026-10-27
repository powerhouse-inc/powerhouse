// The builder's rules core: validate a draft host, judge its options. Browser-safe.
export {
  effectiveFlags,
  FLAG_ENV,
  FLAG_LABELS,
  FLAG_PREREQUISITES,
  flagClosure,
  flagDependents,
  LADDER,
  ladderFlags,
  ladderGaps,
  ladderLevel,
  type FeatureFlag,
  type Flags,
} from "./flags.js";
export {
  fileOf,
  hostVerb,
  membersOf,
  nestedChildren,
  primaryBackendName,
  type BackendMode,
  type Member,
  type MemberBackend,
  type MemberRole,
} from "./members.js";
export {
  applyOption,
  hostOptionList,
  hostOptions,
  ADD_REASONS,
  HOT_RELOAD_REASONS,
  WORKER_COUNTS,
  type HostOption,
  type OptionGroup,
  type OptionStatus,
} from "./options.js";
export {
  checkEnvKey,
  checkSetter,
  checkSetterValue,
  FOLDER_REASONS,
  isContainedPath,
  parsePath,
  type PolicyVerdict,
} from "./policy.js";
export {
  deleteMarkerSchema,
  HOST_RULES_LIMITS,
  hostRulesContextSchema,
  isDelete,
  RULES,
  setterSchema,
  type HostDraft,
  type HostRuleIssue,
  type HostRulesContext,
  type MemberEnv,
  type RuleName,
  type Setter,
} from "./schema.js";
export { applySetters } from "./setters.js";
export {
  onOff,
  REASONS,
  shapeWording,
  validateDraft,
  workerCount,
  type Validation,
} from "./validate.js";
