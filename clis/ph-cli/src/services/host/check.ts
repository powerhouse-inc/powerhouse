import { readFile } from "node:fs/promises";
import path from "node:path";
import { checkHost, type HostIssue } from "@powerhousedao/host-core";
import { loadProjectEnv } from "@powerhousedao/shared/clis/project-env";
import dotenv from "dotenv";

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
    return { ...process.env };
  }
  try {
    return dotenv.parse(await readFile(path.resolve(envFile), "utf8"));
  } catch (error) {
    throw new Error(
      `Cannot read the env file ${envFile}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

export function formatHostIssues(
  file: string,
  issues: readonly HostIssue[],
  deferred: number,
): string {
  if (issues.length === 0) {
    const note =
      deferred > 0
        ? `\n  ${deferred} output token(s) checked declared-only`
        : "";
    return `${file}: ok${note}`;
  }
  const byFile = new Map<string, HostIssue[]>();
  for (const issue of issues) {
    byFile.set(issue.file, [...(byFile.get(issue.file) ?? []), issue]);
  }
  const blocks = [...byFile].map(([at, found]) => {
    const lines = found.flatMap((issue) => {
      const where = issue.path ? `${issue.path}: ` : "";
      const line = `  ${issue.stage}  ${where}${issue.message.replaceAll("\n", "\n    ")}`;
      return issue.hint ? [line, `    hint: ${issue.hint}`] : [line];
    });
    return [at, ...lines].join("\n");
  });
  return blocks.join("\n\n");
}

/** `ph host check <host>`: every issue `ph run` would hit; exits 1 on any. */
export async function runHostCheck(
  args: HostCheckArgs,
): Promise<{ output: string; exitCode: number }> {
  const projectRoot = args.projectRoot ?? process.cwd();
  const env = await checkEnv(projectRoot, args.envFile);
  const { issues, deferred } = await checkHost(args.host, {
    projectRoot,
    env,
    ...(args.verb !== undefined ? { verb: args.verb } : {}),
  });
  return {
    output: formatHostIssues(
      `hosts/${args.host}/host.js`,
      issues,
      deferred.length,
    ),
    exitCode: issues.length > 0 ? 1 : 0,
  };
}
