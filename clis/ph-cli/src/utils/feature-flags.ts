// Single source: the flag gates surfaces in BOTH CLIs (ph-cli registration,
// ph-cmd help/dispatch), so the predicate lives in shared.
export {
  isUniformRunnersEnabled,
  UNIFORM_RUNNERS_FLAG,
} from "@powerhousedao/shared/clis/feature-flags";
