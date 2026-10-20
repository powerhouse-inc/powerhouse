import type { DefinitionCheckReport } from "@powerhousedao/shared/document-model";
import {
  checkDefinitions,
  createDefinitionCheckReport,
  type DefinitionCheckRequest,
  DefinitionCheckSession,
  DefinitionSourceLoader,
  exitCodeFor,
  resolveDefinitionSelection,
} from "document-model/tooling";
import { createDiagnostic } from "document-model";
import { relative, resolve, sep } from "node:path";
import { statSync } from "node:fs";
import { ViteTypeScriptSourceImportAdapter } from "./definitions/import-adapters.js";
import {
  type GenerationResult,
  type GenerationSteps,
  reportSharedBase,
} from "./definitions/generation.js";
import { createGenerationSteps } from "./definitions/build-steps.js";
import { defaultHostValidationFor } from "./definitions/host-validation.js";
import {
  NON_INPUT_DIRECTORIES,
  packageRevisionOf,
} from "./definitions/package-revision.js";
import {
  canonicalPath,
  pathWithin,
  resolvePackagePaths,
  scratchDirectory,
} from "./definitions/paths.js";
import {
  selectedPackageRoot,
  selectionRequest,
} from "./definitions/selection.js";
import type { DefinitionSelectionArgs, ModelCheckArgs } from "../types.js";
import type { OutputInventory } from "./definitions/compiler.js";
import { renderHuman } from "./render-report.js";

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
  onGeneration?: (result: GenerationResult) => void,
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
      onGeneration?.(result);
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
      // A refusal with its own reason is not a compiler failure, even when
      // it happens while TypeScript is the last phase.
      const typecheckFailed =
        phase === "typecheck" && result?.summary === undefined;
      diagnostics.push(
        createDiagnostic({
          code: typecheckFailed
            ? "PH-PKG-TYPECHECK-FAILED"
            : "PH-PKG-RELEASE-EVIDENCE-MISSING",
          path: [phase ?? "release"],
          message:
            buildError instanceof Error
              ? buildError.message
              : (result?.summary ??
                (typecheckFailed
                  ? "The release TypeScript build failed."
                  : "The release generation did not complete for this package revision.")),
          repair: typecheckFailed
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
      ...(result?.status === "ok" && { skipReason: selection.skipReason }),
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
    { onSharedBase: reportSharedBase(streams.err) },
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

export function isIgnoredModelCheckPath(
  packageRoot: string,
  outDir: string,
  filename: string,
): boolean {
  const path = resolve(packageRoot, filename);
  const output = relative(packageRoot, resolve(packageRoot, outDir));
  if (
    filename.split(sep).some((part) => NON_INPUT_DIRECTORIES.includes(part)) ||
    filename === output ||
    filename.startsWith(`${output}${sep}`)
  )
    return true;
  return (
    pathWithin(
      scratchDirectory(packageRoot),
      canonicalPath(path, { resolveMissingLinks: true }),
    ) !== null
  );
}

export async function runModelCheckWatch(
  args: ModelCheckArgs,
  options: RunModelCheckOptions = {},
): Promise<number> {
  const steps = args.release
    ? (options.steps ?? (await createGenerationSteps()))
    : undefined;
  const { packageRoot, outDir } = resolvePackagePaths({
    packageRoot: selectedPackageRoot(args),
    outDir: args.outDir,
  });
  const controller = createModelCheckWatch(args, {
    ...options,
    ...(steps !== undefined && { steps }),
  });
  const excludedOutputs = (): readonly string[] => {
    const outputs = controller.compilerOutputs();
    return outputs === undefined
      ? []
      : [...outputs.directories, ...outputs.files];
  };
  const streams = options.streams ?? processStreams;
  const { watch } = await import("node:fs");
  let timer: NodeJS.Timeout | undefined;
  let lastRevision: string | undefined;
  let checking = false;
  let stopped = false;
  // Read through a call: the stop handler flips it while a check awaits.
  const isStopped = (): boolean => stopped;
  const dirtyPaths = new Set<string | null>();
  const reportFailure = (error: unknown): void => {
    if (error instanceof Error && error.name === "AbortError") return;
    streams.err(`${error instanceof Error ? error.message : String(error)}\n`);
  };
  const revision = (): string =>
    packageRevisionOf(packageRoot, outDir, excludedOutputs());
  const ignored = (filename: string): boolean =>
    isIgnoredModelCheckPath(packageRoot, outDir, filename) ||
    excludedOutputs().some((path) => {
      const output = relative(packageRoot, resolve(packageRoot, path));
      return (
        filename === output ||
        filename.startsWith(`${output}${sep}`) ||
        // A missing parent is one the build created and removed again.
        (output.startsWith(`${filename}${sep}`) &&
          statSync(resolve(packageRoot, filename), {
            throwIfNoEntry: false,
          })?.isFile() !== true)
      );
    });
  const checkChangedRevision = async (force = false): Promise<void> => {
    if (checking || isStopped()) return;
    if (!force && revision() === lastRevision) return;
    checking = true;
    try {
      do {
        dirtyPaths.clear();
        lastRevision = revision();
        const exclusions = JSON.stringify(excludedOutputs());
        await controller.check().catch(reportFailure);
        if (JSON.stringify(excludedOutputs()) === exclusions) {
          force = revision() !== lastRevision;
        } else {
          // The first generation changes which compiler writes count as inputs.
          force = [...dirtyPaths].some(
            (path) => path === null || !ignored(path),
          );
          lastRevision = undefined;
        }
      } while (force && !isStopped());
    } finally {
      checking = false;
    }
  };
  const watcher = watch(
    packageRoot,
    { recursive: true },
    (_event, filename) => {
      try {
        if (filename !== null && ignored(filename)) return;
      } catch (error) {
        reportFailure(error);
        return;
      }
      if (checking) {
        dirtyPaths.add(filename);
        return;
      }
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => {
        void checkChangedRevision().catch(reportFailure);
      }, WATCH_DEBOUNCE_MS);
    },
  );
  const finished = new Promise<number>((resolve) => {
    const stop = () => {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
      watcher.close();
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
      void controller.close().then(() => resolve(0));
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  });
  void checkChangedRevision(true).catch(reportFailure);
  return await finished;
}

type WatchController = {
  readonly check: () => Promise<DefinitionCheckReport>;
  readonly close: () => Promise<void>;
  readonly compilerOutputs: () => OutputInventory | undefined;
};

export function createModelCheckWatch(
  args: ModelCheckArgs,
  options: RunModelCheckOptions = {},
): WatchController {
  assertUsableFlags(args);
  const streams = options.streams ?? processStreams;
  const loader = new DefinitionSourceLoader(
    new ViteTypeScriptSourceImportAdapter(),
    { onSharedBase: reportSharedBase(streams.err) },
  );
  let releaseWork = Promise.resolve();
  let lastGeneration: GenerationResult | undefined;
  const session = new DefinitionCheckSession({
    ...(args.release && {
      run: (_request: DefinitionCheckRequest, signal: AbortSignal) => {
        const pending = releaseWork.then(async () => {
          signal.throwIfAborted();
          const report = await runReleaseCheck(args, options, (result) => {
            lastGeneration = result;
          });
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
    compilerOutputs: () => lastGeneration?.compilerOutputs,
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
