import type { DefinitionCheckReport } from "@powerhousedao/shared/document-model";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { detect } from "package-manager-detector";
import { z } from "zod";
import { getVersion } from "../../get-version.js";
import {
  compilerProjectInputs,
  inventoryFiles,
  type OutputInventory,
} from "./compiler.js";
import {
  directoryDigest,
  filesDigest,
  packageRevisionOf,
} from "./package-revision.js";
import { pathWithin, resolvePackagePaths, scratchDirectory } from "./paths.js";
import {
  listPublishedFiles,
  publishedFileSetDigest,
} from "./published-files.js";

export const APPROVAL_FORMAT_VERSION = 9;
export const APPROVAL_FILE = "release-approval.json";

export function approvalPath(packageRoot: string): string {
  return join(scratchDirectory(packageRoot), APPROVAL_FILE);
}

const digestSchema = z.templateLiteral(["sha256:", z.string()]);
// Only what reuse reads is checked; the rest is the report this ph wrote.
const reportSchema = z.looseObject({
  kind: z.literal("powerhouse.definition-check"),
  profile: z.enum(["edit", "release"]),
  status: z.string(),
});

const buildStateSchema = z.object({
  packageRevision: digestSchema,
  sourcesDigest: z.string(),
  compilerOutputsDigest: z.string(),
  retainedDigest: z.string(),
  outputDigest: z.string(),
  publishedSetDigest: z.string(),
  compilerInputsDigest: z.string(),
  loadedRuntimeFilesDigest: z.string(),
});
type BuildState = z.infer<typeof buildStateSchema>;

const pathsSchema = z.array(z.string()).readonly();

const approvalSchema = buildStateSchema.extend({
  kind: z.literal("powerhouse.release-approval"),
  formatVersion: z.literal(APPROVAL_FORMAT_VERSION),
  sourceSetDigest: z.string(),
  sources: pathsSchema,
  compilerVersion: z.string(),
  compilerOutputs: z
    .object({ directories: pathsSchema, files: pathsSchema })
    .readonly(),
  compilerInputs: pathsSchema,
  compilerProjects: pathsSchema,
  loadedRuntimeFiles: pathsSchema,
  warningsAsErrors: z.boolean(),
  report: reportSchema,
});
export type ReleaseApproval = Omit<z.infer<typeof approvalSchema>, "report"> & {
  readonly report: DefinitionCheckReport;
};

function isReleaseApproval(value: unknown): value is ReleaseApproval {
  return approvalSchema.safeParse(value).success;
}

function externalCompilerFiles(
  packageRoot: string,
  outDir: string,
  inventory: OutputInventory,
): string[] {
  const output = resolve(packageRoot, outDir);
  return inventoryFiles(packageRoot, inventory).filter(
    (path) => pathWithin(output, resolve(packageRoot, path)) === null,
  );
}

export type BuildStateInput = {
  readonly packageRoot: string;
  readonly outDir: string;
  readonly sources: readonly string[];
  readonly compilerOutputs: OutputInventory;
  readonly candidateRoot: string;
  readonly publishedFiles: readonly string[];
  readonly compilerInputs: readonly string[];
  readonly loadedRuntimeFiles: readonly string[];
};

export function captureBuildState(input: BuildStateInput): BuildState {
  return {
    packageRevision: packageRevisionOf(input.packageRoot, input.outDir, [
      ...input.compilerOutputs.directories,
      ...input.compilerOutputs.files,
    ]),
    sourcesDigest: filesDigest(input.packageRoot, input.sources),
    compilerOutputsDigest: filesDigest(
      input.packageRoot,
      externalCompilerFiles(
        input.packageRoot,
        input.outDir,
        input.compilerOutputs,
      ),
    ),
    retainedDigest: directoryDigest(resolve(input.packageRoot, input.outDir)),
    outputDigest: directoryDigest(input.candidateRoot),
    publishedSetDigest: publishedFileSetDigest(
      input.packageRoot,
      input.outDir,
      input.publishedFiles,
    ),
    compilerInputsDigest: filesDigest(input.packageRoot, input.compilerInputs),
    loadedRuntimeFilesDigest: filesDigest(
      input.packageRoot,
      input.loadedRuntimeFiles,
    ),
  };
}

export function changedBuildState(
  expected: BuildState,
  current: BuildState,
): string | undefined {
  if (expected.packageRevision !== current.packageRevision)
    return "the package changed since that check";
  if (expected.sourcesDigest !== current.sourcesDigest)
    return "a compiled source changed since that check";
  if (
    expected.outputDigest !== current.outputDigest ||
    expected.retainedDigest !== current.retainedDigest
  )
    return "the published output changed since that check";
  if (expected.compilerOutputsDigest !== current.compilerOutputsDigest)
    return "the compiler outputs changed since that check";
  if (expected.compilerInputsDigest !== current.compilerInputsDigest)
    return "a TypeScript program or config input changed since that check";
  if (expected.loadedRuntimeFilesDigest !== current.loadedRuntimeFilesDigest)
    return "a loaded runtime file changed since that check";
  if (expected.publishedSetDigest !== current.publishedSetDigest)
    return "the published file set changed since that check";
  return undefined;
}

type ApprovalCheck =
  | { readonly ok: true; readonly approval: ReleaseApproval }
  | { readonly ok: false; readonly reason: string };

export async function readRetainedApproval(input: {
  readonly packageRoot: string;
  readonly outDir: string;
  readonly warningsAsErrors: boolean;
  readonly sourceSetDigest: string;
}): Promise<ApprovalCheck> {
  const request = { ...input, ...resolvePackagePaths(input) };
  const path = approvalPath(request.packageRoot);
  if (!existsSync(path)) {
    return { ok: false, reason: "no completed release check was retained" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return { ok: false, reason: "the retained release check is unreadable" };
  }
  if (
    parsed !== null &&
    typeof parsed === "object" &&
    "kind" in parsed &&
    parsed.kind === "powerhouse.release-approval" &&
    "formatVersion" in parsed &&
    parsed.formatVersion !== APPROVAL_FORMAT_VERSION
  ) {
    return {
      ok: false,
      reason: "the retained release check was made by another ph version",
    };
  }
  if (!isReleaseApproval(parsed)) {
    return { ok: false, reason: "the retained release check is malformed" };
  }
  const approval = parsed;
  if (approval.report.profile !== "release") {
    return {
      ok: false,
      reason: "the retained check ran the edit profile, which approves nothing",
    };
  }
  if (approval.report.status !== "ok") {
    return {
      ok: false,
      reason: `the retained check reported ${approval.report.status}`,
    };
  }
  if (approval.compilerVersion !== getVersion()) {
    return { ok: false, reason: "the compiler changed since that check" };
  }
  if (approval.warningsAsErrors !== request.warningsAsErrors) {
    return { ok: false, reason: "the warning policy changed since that check" };
  }
  if (approval.sourceSetDigest !== request.sourceSetDigest) {
    return {
      ok: false,
      reason: "the selected definition sources changed since that check",
    };
  }
  try {
    const agent = (await detect({ cwd: request.packageRoot }))?.agent ?? "npm";
    const compilerInputs = await compilerProjectInputs(
      request.packageRoot,
      agent,
      approval.compilerProjects,
    );
    const reason = changedBuildState(
      approval,
      captureBuildState({
        packageRoot: request.packageRoot,
        outDir: request.outDir,
        sources: approval.sources,
        compilerOutputs: approval.compilerOutputs,
        candidateRoot: resolve(request.packageRoot, request.outDir),
        publishedFiles: listPublishedFiles(request.packageRoot),
        compilerInputs,
        loadedRuntimeFiles: approval.loadedRuntimeFiles,
      }),
    );
    if (reason !== undefined) return { ok: false, reason };
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof Error
          ? error.message
          : "the retained build state could not be read",
    };
  }
  return { ok: true, approval };
}
