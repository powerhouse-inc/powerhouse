import type { GatingFlag } from "@powerhousedao/shared/document-model";
import type { ReactorFeatureFlags } from "../executor/types.js";

type KnownFlag<F extends keyof ReactorFeatureFlags> = F;
/** Fails to compile when a base-reducer version is gated by a flag this reactor does not know. */
export type BaseReducerGatingFlag = KnownFlag<GatingFlag>;

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
  undoV3: [],
};

/**
 * The flags as plain booleans, with anything unset off except `undoV3`, validated. Callers hold
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
    undoV3: flags.undoV3 ?? true,
  };

  // Against what the caller passed, so an unrecognized name is still reported.
  validateFeatureFlags(flags, FLAG_PREREQUISITES);
  return resolved;
}

/**
 * The flags that differ from the defaults, sorted: `name` when on, `!name` when
 * off. A name this reactor does not know defaults off. Never throws.
 */
export function featureFlagFingerprint(
  flags: Readonly<Record<string, boolean | undefined>>,
): string {
  const defaults: Record<string, boolean> = resolveFeatureFlags();
  return Object.entries(flags)
    .flatMap(([name, value]) => {
      if (value === undefined) return [];
      const fallback = Object.hasOwn(defaults, name) ? defaults[name] : false;
      if (value === fallback) return [];
      return [value ? name : `!${name}`];
    })
    .sort()
    .join(",");
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
