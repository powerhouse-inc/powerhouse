import semver from "semver";

/** The pre-release identifier and npm dist-tag of a branch release. */
export const NEXT_PREID = "next";

export type VersionPrefix =
  | { form: "major"; major: number }
  | { form: "minor"; major: number; minor: number }
  | { form: "patch"; major: number; minor: number; patch: number };

const PREFIX_PATTERN = /^(0|[1-9]\d*)(?:\.(0|[1-9]\d*))?(?:\.(0|[1-9]\d*))?$/;
const NEXT_BUILD_PATTERN =
  /^((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))-next\.(0|[1-9]\d*)$/;

/** "6" | "6.4" | "6.4.1", trimmed. Throws on anything else ("v6.4", "6.4.x", "06.4", "6.4.1.2", ""). */
export function parseVersionPrefix(input: string): VersionPrefix {
  const text = input.trim();
  const match = PREFIX_PATTERN.exec(text);
  if (!match) {
    throw new Error(
      `version_prefix "${input}" is invalid. Give a major (6), a minor (6.4) or a patch (6.4.1), digits and dots only.`,
    );
  }
  const major = Number(match[1]);
  if (match[2] === undefined) return { form: "major", major };
  const minor = Number(match[2]);
  if (match[3] === undefined) return { form: "minor", major, minor };
  return { form: "patch", major, minor, patch: Number(match[3]) };
}

function highestLine(lines: readonly string[]): string | undefined {
  return [...lines].sort(semver.rcompare)[0];
}

/**
 * The version a branch release publishes: `<line>-next.<N>`.
 *
 * @param args.prefix the workflow input, non-empty.
 * @param args.diskVersion the lockstep version in the branch's package.json files.
 * @param args.taken every version already used: npm versions of every public
 * package, plus git tags (leading "v" allowed). Anything that is not
 * X.Y.Z-next.N is ignored for the counter, but stable versions count for the
 * "already released" rule.
 * @throws an Error with an operator-facing message on every refusal.
 */
export function nextBranchVersion(args: {
  prefix: string;
  diskVersion: string;
  taken: readonly string[];
}): string {
  const prefix = parseVersionPrefix(args.prefix);
  const prefixText = args.prefix.trim();

  const disk = semver.parse(args.diskVersion);
  if (!disk) {
    throw new Error(
      `The version in this branch's package.json files ("${args.diskVersion}") is not valid semver.`,
    );
  }
  const diskLine = `${disk.major}.${disk.minor}.${disk.patch}`;

  const taken = args.taken.map((version) => version.trim().replace(/^v/, ""));
  const builds: { line: string; n: number }[] = [];
  for (const version of taken) {
    const match = NEXT_BUILD_PATTERN.exec(version);
    if (match) builds.push({ line: match[1], n: Number(match[2]) });
  }

  let line: string;
  if (prefix.form === "patch") {
    line = `${prefix.major}.${prefix.minor}.${prefix.patch}`;
  } else if (prefix.form === "minor") {
    line =
      highestLine(
        builds
          .map((build) => build.line)
          .filter(
            (candidate) =>
              semver.major(candidate) === prefix.major &&
              semver.minor(candidate) === prefix.minor,
          ),
      ) ?? `${prefix.major}.${prefix.minor}.0`;
  } else {
    const found = highestLine(
      builds
        .map((build) => build.line)
        .filter((candidate) => semver.major(candidate) === prefix.major),
    );
    if (!found) {
      throw new Error(
        `version_prefix ${prefixText} has no -${NEXT_PREID} build on ${prefix.major}.x to continue. Give ${prefix.major}.Y or ${prefix.major}.Y.Z for the first one.`,
      );
    }
    line = found;
  }

  if (semver.lt(line, diskLine)) {
    throw new Error(
      `version_prefix ${prefixText} resolves to the ${line} line, lower than ${diskLine} in this branch's package.json files. Give ${disk.major}.${disk.minor} or higher.`,
    );
  }

  if (taken.includes(line)) {
    throw new Error(
      `version_prefix ${prefixText} resolves to the ${line} line, but ${line} is already released; ${line}-${NEXT_PREID}.N would sort below it. Give a higher prefix, for example ${semver.inc(line, "patch")}.`,
    );
  }

  const counters = builds
    .filter((build) => build.line === line)
    .map((build) => build.n);
  const n = counters.length > 0 ? Math.max(...counters) + 1 : 0;
  const version = `${line}-${NEXT_PREID}.${n}`;

  if (!semver.gt(version, args.diskVersion)) {
    throw new Error(
      `version_prefix ${prefixText} resolves to ${version}, which is not above ${args.diskVersion} in this branch's package.json files. Give a higher prefix.`,
    );
  }

  return version;
}
