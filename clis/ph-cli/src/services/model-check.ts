import type { DefinitionCheckReport } from "@powerhousedao/shared/document-model";
import {
  checkDefinitions,
  createDefinitionCheckReport,
  type DefinitionCheckRequest,
  DefinitionCheckSession,
  DefinitionSourceLoader,
  exitCodeFor,
  formatDefinitionDiagnostic,
  resolveDefinitionSelection,
} from "document-model/tooling";
import { createDiagnostic } from "document-model";
import { relative, resolve, sep } from "node:path";
import { ViteTypeScriptSourceImportAdapter } from "./definitions/import-adapters.js";
import {
  type GenerationResult,
  type GenerationSteps,
  packageRevisionOf,
} from "./definitions/generation.js";
import { defaultHostValidationFor } from "./definitions/host-validation.js";
import { NON_INPUT_DIRECTORIES } from "./definitions/package-revision.js";
import {
  selectedPackageRoot,
  selectionRequest,
} from "./definitions/selection.js";
import type { DefinitionSelectionArgs, ModelCheckArgs } from "../types.js";

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

function assertUsableFlags(args: ModelCheckArgs): void {
  if (args.watch === true && args.json === true) {
    throw new UsageError(
      "--json prints one report and exits; use --watch --json-lines for machine output that follows edits.",
    );
  }
  if (args.json === true && args.jsonLines === true) {
    throw new UsageError(
      "--json and --json-lines are two output shapes; choose one.",
    );
  }
  if (args.jsonLines === true && args.watch !== true) {
    throw new UsageError("--json-lines is the watch output; add --watch.");
  }
}

export function renderHuman(report: DefinitionCheckReport): string {
  const lines: string[] = [];
  const sources = report.sourceSet.sources.length;
  lines.push(
    `${report.status} (${report.profile} profile, ${report.sourceSet.mode}, ${sources} source${sources === 1 ? "" : "s"})`,
  );
  if (report.status === "skipped") {
    lines.push(
      'This package declares mode "schema-first", so no definition was checked. That is not release approval.',
    );
  }
  for (const definition of report.definitions) {
    const version =
      definition.version === undefined ? "" : ` v${String(definition.version)}`;
    lines.push(`  ${definition.kind} ${definition.key}${version}`);
  }
  for (const diagnostic of report.diagnostics) {
    lines.push(formatDefinitionDiagnostic(diagnostic));
  }
  lines.push(
    `${report.summary.errors} error(s), ${report.summary.warnings} warning(s)`,
  );
  return lines.join("\n");
}

export type CheckStreams = {
  readonly out: (text: string) => void;
  readonly err: (text: string) => void;
};

export const processStreams: CheckStreams = {
  out: (text) => process.stdout.write(text),
  err: (text) => process.stderr.write(text),
};

let captureDepth = 0;
let captureTarget: ((text: string) => void) | undefined;
let uncapturedWrite: typeof process.stdout.write | undefined;

export async function withCapturedStdout<T>(
  err: (text: string) => void,
  work: () => Promise<T>,
): Promise<T> {
  captureTarget = err;
  captureDepth += 1;
  if (captureDepth === 1) {
    uncapturedWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((
      chunk: string | Uint8Array,
      ...rest: unknown[]
    ): boolean => {
      captureTarget?.(
        typeof chunk === "string" ? chunk : Buffer.from(chunk).toString(),
      );
      const callback = rest.find((value) => typeof value === "function");
      (callback as (() => void) | undefined)?.();
      return true;
    }) as typeof process.stdout.write;
  }
  try {
    return await work();
  } finally {
    captureDepth -= 1;
    if (captureDepth === 0) {
      captureTarget = undefined;
      if (uncapturedWrite !== undefined) {
        process.stdout.write = uncapturedWrite;
        uncapturedWrite = undefined;
      }
    }
  }
}

function writeUncaptured(streams: CheckStreams, text: string): void {
  if (streams.out !== processStreams.out || uncapturedWrite === undefined) {
    streams.out(text);
    return;
  }
  uncapturedWrite(text);
}

export function writeReport<T>(
  streams: CheckStreams,
  report: T,
  machine: boolean,
  render: (report: T) => string,
): void {
  if (machine) {
    writeUncaptured(streams, `${JSON.stringify(report)}\n`);
  } else {
    streams.err(`${render(report)}\n`);
  }
}

type RunModelCheckOptions = {
  readonly streams?: CheckStreams;
  readonly steps?: GenerationSteps;
};

export function definitionRequestFor(
  args: DefinitionSelectionArgs,
  outDir: string,
  loader: DefinitionSourceLoader,
): Omit<DefinitionCheckRequest, "profile" | "signal"> {
  const packageRoot = selectedPackageRoot(args);
  return {
    ...selectionRequest(args),
    loader,
    packageRevision: packageRevisionOf(packageRoot, outDir),
    hostValidation: defaultHostValidationFor(packageRoot),
  };
}

export function unstartedCheckReport(
  args: DefinitionSelectionArgs,
  profile: DefinitionCheckRequest["profile"],
  error: unknown,
): DefinitionCheckReport {
  const selection = resolveDefinitionSelection(selectionRequest(args));
  return createDefinitionCheckReport({
    profile,
    sourceSet: selection.sourceSet,
    definitions: [],
    diagnostics:
      selection.status === "failed"
        ? selection.diagnostics
        : [
            ...selection.diagnostics,
            createDiagnostic({
              code: "PH-CONFIG-SOURCE-INVALID",
              path: ["packageRoot"],
              message: `The package could not be read: ${error instanceof Error ? error.message : String(error)}`,
              repair:
                "Make every file under the package root readable and run the check again.",
            }),
          ],
  });
}

function checkRequestFor(
  args: ModelCheckArgs,
  loader: DefinitionSourceLoader,
): Omit<DefinitionCheckRequest, "signal"> {
  return {
    ...definitionRequestFor(args, args.outDir, loader),
    profile: args.release ? "release" : "edit",
    warningsAsErrors: args.warningsAsErrors,
  };
}

async function runReleaseCheck(
  args: ModelCheckArgs,
  options: RunModelCheckOptions,
): Promise<DefinitionCheckReport> {
  const streams = options.streams ?? processStreams;
  return await withCapturedStdout(streams.err, async () => {
    let result: GenerationResult | undefined;
    let buildError: unknown;
    try {
      const { runBuild } = await import("./build.js");
      result = await runBuild(
        { ...args, noSharedDeps: false, ignoreTypeErrors: false },
        {
          promoteOutput: false,
          log: streams.err,
          ...(options.steps !== undefined && { steps: options.steps }),
        },
      );
    } catch (error) {
      buildError = error;
    }
    if (
      result?.report !== undefined &&
      result.status === result.report.status
    ) {
      return result.report;
    }
    const selection = resolveDefinitionSelection(selectionRequest(args));
    const diagnostics = [
      ...(result?.report?.diagnostics ?? selection.diagnostics),
    ];
    if (
      result === undefined ||
      result.status === "failed" ||
      (result.report === undefined && selection.status === "ready")
    ) {
      const phase = result?.phases.at(-1);
      diagnostics.push(
        createDiagnostic({
          code:
            phase === "typecheck"
              ? "PH-PKG-TYPECHECK-FAILED"
              : "PH-PKG-RELEASE-EVIDENCE-MISSING",
          path: [phase ?? "release"],
          message:
            buildError instanceof Error
              ? buildError.message
              : phase === "typecheck"
                ? "The release TypeScript build failed."
                : "The release generation did not complete for this package revision.",
          repair:
            phase === "typecheck"
              ? "Fix the TypeScript errors and run the release check again."
              : "Resolve the reported build failure and rerun the release check on an unchanged package.",
        }),
      );
    }
    return createDefinitionCheckReport({
      profile: "release",
      sourceSet: result?.report?.sourceSet ?? selection.sourceSet,
      definitions: result?.report?.definitions ?? [],
      diagnostics,
      warningsAsErrors: args.warningsAsErrors,
      skipped: result?.status === "ok" && selection.status === "skipped",
    });
  });
}

export async function runModelCheck(
  args: ModelCheckArgs,
  options: RunModelCheckOptions = {},
): Promise<number> {
  assertUsableFlags(args);
  const streams = options.streams ?? processStreams;
  const report = args.release
    ? await runReleaseCheck(args, options)
    : await runEditCheck(args, streams);
  writeReport(streams, report, args.json, renderHuman);
  return exitCodeFor(report);
}

async function runEditCheck(
  args: ModelCheckArgs,
  streams: CheckStreams,
): Promise<DefinitionCheckReport> {
  const loader = new DefinitionSourceLoader(
    new ViteTypeScriptSourceImportAdapter(),
  );
  try {
    return await withCapturedStdout(streams.err, () =>
      checkDefinitions(checkRequestFor(args, loader)),
    );
  } catch (error) {
    return unstartedCheckReport(args, "edit", error);
  } finally {
    await loader.dispose();
  }
}

const WATCH_DEBOUNCE_MS = 50;

export async function runModelCheckWatch(
  args: ModelCheckArgs,
  options: RunModelCheckOptions = {},
): Promise<number> {
  const controller = createModelCheckWatch(args, options);
  const streams = options.streams ?? processStreams;
  const packageRoot = selectedPackageRoot(args);
  const { watch } = await import("node:fs");
  let timer: NodeJS.Timeout | undefined;
  let lastRevision = packageRevisionOf(packageRoot, args.outDir);
  const output = relative(packageRoot, resolve(packageRoot, args.outDir));
  const reportFailure = (error: unknown): void => {
    if (error instanceof Error && error.name === "AbortError") return;
    streams.err(`${error instanceof Error ? error.message : String(error)}\n`);
  };
  const checkChangedRevision = async (): Promise<void> => {
    const revision = packageRevisionOf(packageRoot, args.outDir);
    if (revision === lastRevision) return;
    lastRevision = revision;
    await controller.check();
  };
  const watcher = watch(
    packageRoot,
    { recursive: true },
    (_event, filename) => {
      if (filename !== null) {
        const parts = filename.split(sep);
        if (
          parts.some((part) => NON_INPUT_DIRECTORIES.includes(part)) ||
          filename === output ||
          filename.startsWith(`${output}${sep}`)
        )
          return;
      }
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => {
        void checkChangedRevision().catch(reportFailure);
      }, WATCH_DEBOUNCE_MS);
    },
  );

  await controller.check().catch(reportFailure);

  return await new Promise<number>((resolve) => {
    const stop = () => {
      if (timer !== undefined) clearTimeout(timer);
      watcher.close();
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
      void controller.close().then(() => resolve(0));
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  });
}

type WatchController = {
  readonly check: () => Promise<DefinitionCheckReport>;
  readonly close: () => Promise<void>;
};

export function createModelCheckWatch(
  args: ModelCheckArgs,
  options: RunModelCheckOptions = {},
): WatchController {
  assertUsableFlags(args);
  const streams = options.streams ?? processStreams;
  const loader = new DefinitionSourceLoader(
    new ViteTypeScriptSourceImportAdapter(),
  );
  let releaseWork = Promise.resolve();
  const session = new DefinitionCheckSession({
    ...(args.release && {
      run: (_request: DefinitionCheckRequest, signal: AbortSignal) => {
        const pending = releaseWork.then(async () => {
          signal.throwIfAborted();
          const report = await runReleaseCheck(args, options);
          signal.throwIfAborted();
          return report;
        });
        releaseWork = pending.then(
          () => undefined,
          () => undefined,
        );
        return pending;
      },
    }),
    publish: (report) => {
      writeReport(streams, report, args.jsonLines, renderHuman);
    },
  });

  return {
    check: () =>
      withCapturedStdout(streams.err, () =>
        session.request(checkRequestFor(args, loader)),
      ),
    close: async () => {
      session.close();
      await releaseWork;
      await loader.dispose();
    },
  };
}
