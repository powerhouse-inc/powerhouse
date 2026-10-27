/** Mirrors reactor's FLAG_PREREQUISITES; a test pins the names, not the values. */
export const FLAG_PREREQUISITES = {
  documentDecisions: [],
  authEnforcement: ["documentDecisions"],
  authGroups: ["authEnforcement"],
  authConditions: ["authGroups"],
} as const satisfies Record<string, readonly string[]>;
export type FeatureFlag = keyof typeof FLAG_PREREQUISITES;

/** The access-control ladder, bottom up: level n turns on the first n flags. */
export const LADDER: readonly FeatureFlag[] = [
  "documentDecisions",
  "authEnforcement",
  "authGroups",
  "authConditions",
];

export const FLAG_LABELS: Record<FeatureFlag, string> = {
  documentDecisions: "Deletion history",
  authEnforcement: "Permissions",
  authGroups: "Groups",
  authConditions: "Conditions",
};

/** The env var each flag is read from (host-core protocolEnv). */
export const FLAG_ENV: Record<FeatureFlag, string> = {
  documentDecisions: "REACTOR_DOCUMENT_DECISIONS",
  authEnforcement: "REACTOR_AUTH_ENFORCEMENT",
  authGroups: "REACTOR_AUTH_GROUPS",
  authConditions: "REACTOR_AUTH_CONDITIONS",
};

export type Flags = Record<FeatureFlag, boolean>;

export function ladderFlags(level: number): Flags {
  return Object.fromEntries(
    LADDER.map((flag, index) => [flag, index < level]),
  ) as Flags;
}

/** The flag and everything it needs, bottom up. */
export function flagClosure(flag: FeatureFlag): FeatureFlag[] {
  const needs: readonly FeatureFlag[] = FLAG_PREREQUISITES[flag];
  return [...new Set([...needs.flatMap(flagClosure), flag])];
}

/** Every flag that needs this one, directly or not. */
export function flagDependents(flag: FeatureFlag): FeatureFlag[] {
  return LADDER.filter(
    (other) => other !== flag && flagClosure(other).includes(flag),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The flags a switchboard boots with: an env var wins over the protocol. */
export function effectiveFlags(
  protocol: unknown,
  env: Readonly<Record<string, string>> = {},
): { flags: Flags; fromEnv: Partial<Record<FeatureFlag, string>> } {
  const declared =
    isRecord(protocol) && isRecord(protocol.featureFlags)
      ? protocol.featureFlags
      : {};
  const flags = {} as Flags;
  const fromEnv: Partial<Record<FeatureFlag, string>> = {};
  for (const flag of LADDER) {
    const key = FLAG_ENV[flag];
    if (Object.hasOwn(env, key)) {
      flags[flag] = env[key] === "true";
      fromEnv[flag] = key;
    } else {
      flags[flag] = declared[flag] === true;
    }
  }
  return { flags, fromEnv };
}

/** Each flag that is on without one it needs. */
export function ladderGaps(
  flags: Flags,
): { flag: FeatureFlag; missing: FeatureFlag[] }[] {
  return LADDER.flatMap((flag) => {
    if (!flags[flag]) return [];
    const needs: readonly FeatureFlag[] = FLAG_PREREQUISITES[flag];
    const missing = needs.filter((need) => !flags[need]);
    return missing.length > 0 ? [{ flag, missing }] : [];
  });
}

/** How many ladder flags are on from the bottom. */
export function ladderLevel(flags: Flags): number {
  let level = 0;
  while (level < LADDER.length && flags[LADDER[level]]) level += 1;
  return level;
}
