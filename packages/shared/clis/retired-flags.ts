/**
 * Environment variables that used to switch a feature and no longer do.
 *
 * A retired variable goes through two releases: first the CLI warns that it
 * has no effect (`action: "warn"`), then it refuses to start while the
 * variable still asks for the removed behaviour (`action: "refuse"`).
 * Moving an entry from one to the other is a one-line change.
 */

export type RetiredFlagAction = "warn" | "refuse";

export interface RetiredFlag {
  /** The environment variable. */
  name: string;
  /** The release in which the variable stopped having an effect. */
  retiredIn: string;
  /** The first release that refuses to start with the variable set this way. */
  refusedIn: string;
  /** Which values ask for the removed behaviour: a false one, or any. */
  when: "false" | "set";
  action: RetiredFlagAction;
  /** What is true now, as a full sentence. */
  message: string;
}

export const retiredFlags: readonly RetiredFlag[] = [
  {
    name: "FEATURE_UNIFORM_RUNNERS_ENABLED",
    retiredIn: "6.3",
    refusedIn: "6.4",
    when: "false",
    action: "warn",
    message: "Hosts and `ph run` are always on now.",
  },
  {
    name: "FEATURE_PLUGIN_HOST_ENABLED",
    retiredIn: "6.4",
    refusedIn: "6.4",
    when: "false",
    action: "refuse",
    message:
      "Switchboard always boots through the plugin host now, and starts the same subsystems there. " +
      "To choose them yourself, list the plugins under `runner.plugins` in hosts/switchboard/host.js.",
  },
];

/** Set once a process has warned, so the CLIs it spawns do not repeat it. */
export const RETIRED_FLAGS_WARNED_ENV = "PH_RETIRED_FLAGS_WARNED";

/** The values that switch a variable off. */
export const FALSE_VALUES: ReadonlySet<string> = new Set([
  "false",
  "0",
  "off",
  "no",
]);

export interface RetiredFlagFinding {
  flag: RetiredFlag;
  /** The value as set in the environment. */
  value: string;
  text: string;
}

function findingText(flag: RetiredFlag, value: string): string {
  const setTo = flag.when === "false" ? "set to false" : "set";
  const head = `${flag.name}=${value} has no effect since ${flag.retiredIn}. ${flag.message}`;
  return flag.action === "refuse"
    ? `${head} Remove the variable: since ${flag.refusedIn} the CLI refuses to start with it ${setTo}.`
    : `${head} Remove the variable: ${flag.refusedIn} will refuse to start with it ${setTo}.`;
}

/** The retired variables that `env` still sets in the way their entry names. */
export function findRetiredFlags(
  env: Record<string, string | undefined> = process.env,
  flags: readonly RetiredFlag[] = retiredFlags,
): RetiredFlagFinding[] {
  const findings: RetiredFlagFinding[] = [];
  for (const flag of flags) {
    const value = env[flag.name];
    if (value === undefined) continue;
    const normalized = value.trim().toLowerCase();
    const hit =
      flag.when === "set" ? normalized !== "" : FALSE_VALUES.has(normalized);
    if (hit) findings.push({ flag, value, text: findingText(flag, value) });
  }
  return findings;
}

/**
 * Run at CLI start. Prints one warning per `warn` entry to stderr and throws
 * for `refuse` entries. A process that warned marks `env`, which its child
 * CLIs inherit, so one invocation warns once.
 */
export function checkRetiredFlags(
  env: Record<string, string | undefined> = process.env,
  flags: readonly RetiredFlag[] = retiredFlags,
  warn: (text: string) => void = (text) => console.warn(text),
): void {
  const findings = findRetiredFlags(env, flags);
  const refused = findings.filter((f) => f.flag.action === "refuse");
  if (refused.length > 0) {
    throw new Error(refused.map((f) => f.text).join("\n"));
  }
  if (findings.length === 0 || env[RETIRED_FLAGS_WARNED_ENV] === "1") return;
  for (const finding of findings) {
    warn(`Warning: ${finding.text}`);
  }
  env[RETIRED_FLAGS_WARNED_ENV] = "1";
}
