import type { DefinitionCheckReport } from "@powerhousedao/shared/document-model";
import type { ProjectDefinitions } from "document-model/tooling";
import { type ProjectModules, readProjectDefinitions } from "./project.js";

export type ModelStreams = {
  readonly out: (text: string) => void;
  readonly err: (text: string) => void;
};

export type ModelRunOptions = {
  /** Default: the directory ph-cli runs in, which ph-cmd sets to the project root. */
  readonly projectRoot?: string;
  readonly streams?: ModelStreams;
};

type Status = DefinitionCheckReport["status"];

const EXIT_CODES: Readonly<Record<Status, 0 | 1 | 2>> = {
  ok: 0,
  skipped: 0,
  invalid: 1,
  failed: 2,
};

export const processStreams: ModelStreams = {
  out: (text) => void process.stdout.write(text),
  err: (text) => void process.stderr.write(text),
};

/** Sends what is written to stdout to `write` until the returned restore runs. */
function redirectStdout(write: (text: string) => void): () => void {
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string | Uint8Array, ...rest: unknown[]) => {
    write(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString());
    const callback = rest.find((value) => typeof value === "function");
    (callback as (() => void) | undefined)?.();
    return true;
  }) as typeof process.stdout.write;
  return () => {
    process.stdout.write = original;
  };
}

/** Vite and the package's own modules may print while they load. */
async function stdoutTo<T>(
  write: (text: string) => void,
  work: () => Promise<T>,
): Promise<T> {
  const restore = redirectStdout(write);
  try {
    return await work();
  } finally {
    restore();
  }
}

/**
 * Loads the project once, builds a report from it and prints the report.
 * Returns the exit code: 0 ok or skipped, 1 invalid, 2 failed or not run.
 * Any throw, from loading through printing, is exit 2: exit 1 means the
 * models were read and one is wrong.
 */
export async function runModelCommand<R extends { readonly status: Status }>(
  request: {
    readonly name: string;
    readonly json: boolean;
    readonly read: (
      project: ProjectDefinitions,
      modules: ProjectModules,
    ) => R | Promise<R>;
    readonly render: (report: R) => string;
  },
  options: ModelRunOptions,
): Promise<number> {
  const streams = options.streams ?? processStreams;
  const projectRoot = options.projectRoot ?? process.cwd();
  try {
    const report = await stdoutTo(streams.err, () =>
      readProjectDefinitions(projectRoot, request.read),
    );
    const text = request.json ? JSON.stringify(report) : request.render(report);
    streams.out(`${text}\n`);
    return EXIT_CODES[report.status];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    streams.err(`${request.name} could not run: ${message}\n`);
    return 2;
  }
}

/**
 * Runs a `ph model` command as the process and exits with its code once
 * stdout and stderr have flushed. Returning instead would let a timer that a
 * package module started keep the process alive after the report.
 *
 * With `--json`, stdout belongs to the report for the whole run: anything
 * else printed, even by a module's timer after loading, goes to stderr. The
 * report goes out through the writer saved before the redirect.
 */
export async function exitWithModelCommand(
  json: boolean,
  run: (streams: ModelStreams) => Promise<number>,
): Promise<never> {
  const writeStdout = process.stdout.write.bind(process.stdout);
  const streams: ModelStreams = json
    ? { out: (text) => void writeStdout(text), err: processStreams.err }
    : processStreams;
  if (json) redirectStdout(processStreams.err);
  const code = await run(streams);
  return await new Promise<never>(() => {
    process.stderr.write("", () => writeStdout("", () => process.exit(code)));
  });
}
