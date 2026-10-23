import { writeFile } from "node:fs/promises";
import path from "node:path";
import { exportHost, type HostExport } from "@powerhousedao/host-core";
import { CALLER_CWD_ENV } from "@powerhousedao/shared/clis/command-names";

export interface HostExportArgs {
  host: string;
  out?: string;
  projectRoot?: string;
}

export interface HostExportResult {
  stdout?: string;
  stderr?: string;
  exitCode: number;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** `ph host export <host>`: the declared host and its members as JSON. */
export async function runHostExport(
  args: HostExportArgs,
): Promise<HostExportResult> {
  let exported: HostExport;
  try {
    exported = await exportHost(args.projectRoot ?? process.cwd(), args.host);
  } catch (error) {
    return { stderr: `${message(error)}\n`, exitCode: 1 };
  }
  const json = `${JSON.stringify(exported, null, 2)}\n`;
  if (args.out === undefined) return { stdout: json, exitCode: 0 };
  try {
    const from = process.env[CALLER_CWD_ENV] ?? process.cwd();
    await writeFile(path.resolve(from, args.out), json);
  } catch (error) {
    return {
      stderr: `Cannot write ${args.out}: ${message(error)}\n`,
      exitCode: 1,
    };
  }
  return { exitCode: 0 };
}
