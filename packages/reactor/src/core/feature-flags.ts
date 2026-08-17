import type { ReactorFeatureFlags } from "../executor/types.js";

/** A flag name mapped to the flags it requires. */
export type FeatureFlagPrerequisites = Record<string, readonly string[]>;

/**
 * Every flag this reactor knows, with the flags it requires. A stage adds its
 * flag here when it ships, so asking an older reactor for a later stage's flag
 * is an unrecognized name rather than a flag that quietly does nothing.
 */
export const FLAG_PREREQUISITES: Record<
  keyof ReactorFeatureFlags,
  readonly (keyof ReactorFeatureFlags)[]
> = {
  documentDecisions: [],
  authEnforcement: ["documentDecisions"],
  authGroups: ["authEnforcement"],
  authConditions: ["authGroups"],
};

/**
 * The flags as plain booleans, with anything unset off, validated. Callers hold
 * a partial set, because that is what crosses to a pooled worker, and every
 * consumer needs the same resolution of it.
 */
export function resolveFeatureFlags(
  flags: Partial<ReactorFeatureFlags> = {},
): ReactorFeatureFlags {
  const resolved: ReactorFeatureFlags = {
    documentDecisions: flags.documentDecisions ?? false,
    authEnforcement: flags.authEnforcement ?? false,
    authGroups: flags.authGroups ?? false,
    authConditions: flags.authConditions ?? false,
  };

  // Against what the caller passed, so an unrecognized name is still reported.
  validateFeatureFlags(flags, FLAG_PREREQUISITES);
  return resolved;
}

/**
 * Throws when the flags ask for enforcement the reactor cannot deliver. Either
 * failure would otherwise read as enforcement being on while the reactor
 * applies less than the caller asked for.
 */
export function validateFeatureFlags(
  flags: Record<string, boolean | undefined>,
  prerequisites: FeatureFlagPrerequisites,
): void {
  const known = Object.keys(prerequisites);

  const unrecognized = Object.keys(flags).filter(
    (name) => !known.includes(name),
  );
  if (unrecognized.length > 0) {
    throw new Error(
      `Unrecognized reactor feature flag: ${unrecognized.join(", ")}. ` +
        `This reactor knows: ${known.join(", ")}.`,
    );
  }

  for (const name of known) {
    if (flags[name] !== true) {
      continue;
    }
    const missing = prerequisites[name].filter(
      (required) => flags[required] !== true,
    );
    if (missing.length > 0) {
      throw new Error(
        `Reactor feature flag ${name} requires ${missing.join(", ")}.`,
      );
    }
  }
}
