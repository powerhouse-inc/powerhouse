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
  switchboardSettings,
  valueAt,
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
  SETTING_REASONS,
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
  SETTINGS_ELSEWHERE,
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
  type HostEnv,
  type HostRuleIssue,
  type HostRulesContext,
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
  workerSettings,
  type Validation,
} from "./validate.js";
