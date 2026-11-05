import type { DefinitionCheck } from "../check/types.js";
import { hostValidationCheck } from "./checks/host-validation.js";
import type { ReleaseCheckInput } from "./types.js";

/**
 * @experimental The checks the release profile of `ph build --release` and
 * `ph model check --release` adds to `documentModelChecks`. They read the
 * release evidence a caller gathered.
 */
export const releaseChecks: readonly DefinitionCheck<ReleaseCheckInput>[] =
  Object.freeze([hostValidationCheck]);
