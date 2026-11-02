/** How one document type's keyframes are written and how many stay. */
export type KeyframeRule = {
  /** A keyframe every `interval` revisions. */
  interval: number;
  /** Keyframes kept per document stream, newest first; null keeps them all. */
  keep: number | null;
};

/** A rule with the parts it leaves out taken from the level below it. */
export type KeyframeRuleOverride = {
  interval?: number;
  keep?: number | null;
};

/**
 * Keyframe rules: `default` over the built-in rule, then `types` by exact
 * document type over `default`. Plain data, so it crosses into workers.
 */
export type KeyframeSettings = {
  default?: KeyframeRuleOverride;
  types?: Record<string, KeyframeRuleOverride>;
};

/** Without any configuration: a keyframe every 10 revisions, all of them kept. */
export const DEFAULT_KEYFRAME_RULE: Readonly<KeyframeRule> = Object.freeze({
  interval: 10,
  keep: null,
});

function applyOverride(
  base: KeyframeRule,
  override: KeyframeRuleOverride | undefined,
): KeyframeRule {
  return {
    interval: override?.interval ?? base.interval,
    keep: override?.keep === undefined ? base.keep : override.keep,
  };
}

/** The rule `documentType` writes and prunes under. */
export function resolveKeyframeRule(
  settings: KeyframeSettings | undefined,
  documentType: string,
): KeyframeRule {
  return applyOverride(
    applyOverride(DEFAULT_KEYFRAME_RULE, settings?.default),
    settings?.types?.[documentType],
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRule(raw: unknown, path: string): KeyframeRuleOverride {
  if (!isPlainRecord(raw)) {
    throw new Error(`${path} must be an object`);
  }
  const rule: KeyframeRuleOverride = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === "interval") {
      if (!Number.isSafeInteger(value) || (value as number) < 1) {
        throw new Error(`${path}.interval must be a whole number from 1 up`);
      }
      rule.interval = value as number;
    } else if (key === "keep") {
      if (
        value !== null &&
        (!Number.isSafeInteger(value) || (value as number) < 1)
      ) {
        throw new Error(
          `${path}.keep must be a whole number from 1 up, or null to keep all`,
        );
      }
      rule.keep = value as number | null;
    } else {
      throw new Error(`${path} has an unknown key: ${key}`);
    }
  }
  return rule;
}

/**
 * Validates settings read from a config file or the environment; `source`
 * names where they came from in the error.
 */
export function parseKeyframeSettings(
  raw: unknown,
  source: string,
): KeyframeSettings {
  if (!isPlainRecord(raw)) {
    throw new Error(`${source} must be an object`);
  }
  const settings: KeyframeSettings = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === "default") {
      settings.default = parseRule(value, `${source}.default`);
    } else if (key === "types") {
      if (!isPlainRecord(value)) {
        throw new Error(`${source}.types must be an object`);
      }
      settings.types = Object.fromEntries(
        Object.entries(value).map(([documentType, rule]) => [
          documentType,
          parseRule(rule, `${source}.types[${documentType}]`),
        ]),
      );
    } else {
      throw new Error(`${source} has an unknown key: ${key}`);
    }
  }
  return settings;
}
