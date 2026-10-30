import { readFile } from "node:fs/promises";
import path from "node:path";
import { checkHost, type HostIssue } from "@powerhousedao/host-core";
import { CALLER_CWD_ENV } from "@powerhousedao/shared/clis/command-names";
import {
  envNamesBeforeProjectEnv,
  loadProjectEnv,
} from "@powerhousedao/shared/clis/project-env";
import dotenv from "dotenv";
import { rememberShellNames } from "../../runners/member-config.js";

export interface HostCheckArgs {
  host: string;
  envFile?: string;
  verb?: string;
  projectRoot?: string;
}

/** Without `envFile`: what `ph run` sees (project .env under process env). */
async function checkEnv(
  projectRoot: string,
  envFile: string | undefined,
): Promise<Record<string, string | undefined>> {
  if (envFile === undefined) {
    loadProjectEnv(projectRoot);
    // A snapshot: a .env a runner's checkBoot loads later never reaches it.
    const env = { ...process.env };
    // The switchboard's checkBoot puts the .env's values under the host file.
    rememberShellNames(env, envNamesBeforeProjectEnv() ?? Object.keys(env));
    return env;
  }
  const from = process.env[CALLER_CWD_ENV] ?? process.cwd();
  try {
    return dotenv.parse(await readFile(path.resolve(from, envFile), "utf8"));
  } catch (error) {
    throw new Error(
      `Cannot read the env file ${envFile}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

function issueBlocks(
  found: readonly { label: string; issue: HostIssue }[],
): string {
  const byFile = new Map<string, typeof found>();
  for (const entry of found) {
    byFile.set(entry.issue.file, [
      ...(byFile.get(entry.issue.file) ?? []),
      entry,
    ]);
  }
  const blocks = [...byFile].map(([at, entries]) => {
    const lines = entries.flatMap(({ label, issue }) => {
      const where = issue.path ? `${issue.path}: ` : "";
      const line = `  ${label}  ${where}${issue.message.replaceAll("\n", "\n    ")}`;
      return issue.hint ? [line, `    hint: ${issue.hint}`] : [line];
    });
    return [at, ...lines].join("\n");
  });
  return blocks.join("\n\n");
}

export function formatHostIssues(
  file: string,
  issues: readonly HostIssue[],
  deferred: number,
  warnings: readonly HostIssue[] = [],
): string {
  const warned = warnings.map((issue) => ({ label: "warning", issue }));
  if (issues.length === 0) {
    const note =
      deferred > 0
        ? `\n  ${deferred} output token(s) checked declared-only`
        : "";
    const tail = warned.length > 0 ? `\n\n${issueBlocks(warned)}` : "";
    return `${file}: ok${note}${tail}`;
  }
  return issueBlocks([
    ...issues.map((issue) => ({ label: issue.stage, issue })),
    ...warned,
  ]);
}

/** `ph host check <host>`: exits 1 on any issue; warnings only print. */
export async function runHostCheck(
  args: HostCheckArgs,
): Promise<{ output: string; exitCode: number }> {
  const projectRoot = args.projectRoot ?? process.cwd();
  const env = await checkEnv(projectRoot, args.envFile);
  const { issues, warnings, deferred } = await checkHost(args.host, {
    projectRoot,
    env,
    ...(args.verb !== undefined ? { verb: args.verb } : {}),
  });
  return {
    output: formatHostIssues(
      `hosts/${args.host}/host.js`,
      issues,
      deferred.length,
      warnings,
    ),
    exitCode: issues.length > 0 ? 1 : 0,
  };
}
