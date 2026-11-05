const LOG_LEVELS = new Set([
  "silent",
  "error",
  "warn",
  "notice",
  "http",
  "info",
  "verbose",
  "silly",
]);

const FLAGS = new Set(["--dry-run", "--provenance", "--json"]);

// npm publish options allowed with a value, and the values each accepts.
const VALUED = new Map<string, (value: string) => boolean>([
  ["--tag", () => true],
  ["--access", (value) => value === "public" || value === "restricted"],
  ["--otp", () => true],
  ["--loglevel", (value) => LOG_LEVELS.has(value)],
]);

/** The npm arguments a publish that requires an approval forwards. */
export const ALLOWED_NPM_ARGUMENTS =
  "--tag <tag>, --access <public|restricted>, --otp <code>, --dry-run, --provenance, --json, --loglevel <level>";

/**
 * The forwarded npm arguments outside `ALLOWED_NPM_ARGUMENTS`, as given. A
 * value option takes the next argument as its value only when it does not
 * start with `-`; one left without a value is refused. Any other spelling,
 * abbreviation or alias npm would accept is refused too, since it could
 * select another package to publish.
 */
export function refusedNpmArguments(args: readonly string[]): string[] {
  const refused: string[] = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (FLAGS.has(arg)) continue;
    const equals = arg.indexOf("=");
    const accepts = VALUED.get(equals === -1 ? arg : arg.slice(0, equals));
    if (accepts === undefined) {
      refused.push(arg);
    } else if (equals !== -1) {
      const value = arg.slice(equals + 1);
      if (value === "" || !accepts(value)) refused.push(arg);
    } else {
      const value = args[index + 1] as string | undefined;
      if (value === undefined || value.startsWith("-")) {
        refused.push(arg);
      } else {
        index++;
        if (!accepts(value)) refused.push(`${arg} ${value}`);
      }
    }
  }
  return refused;
}

// npm configuration that makes npm pack or publish act on a workspace rather
// than the package in its directory.
const TARGET_SELECTING = new Set([
  "workspace",
  "workspaces",
  "include_workspace_root",
]);

/**
 * The environment variables that set npm configuration selecting another
 * package to publish, sorted. npm reads `npm_config_*` in any case and with
 * `-` or `_`. `npm_config_prefix` is not one: npm takes the package
 * directory from a prefix given on its command line only, and `npm run`
 * sets it to the global prefix.
 */
export function targetSelectingNpmEnvironment(
  env: Readonly<Record<string, string | undefined>>,
): string[] {
  return Object.keys(env)
    .filter((name) => {
      const key = name.toLowerCase().replaceAll("-", "_");
      return (
        key.startsWith("npm_config_") &&
        TARGET_SELECTING.has(key.slice("npm_config_".length)) &&
        Boolean(env[name])
      );
    })
    .sort();
}
