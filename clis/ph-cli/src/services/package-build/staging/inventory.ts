import { dirname } from "node:path";
import { pathWithin } from "@powerhousedao/shared/clis/real-paths";
import {
  buildInfoFile,
  type EmitOptions,
  outFileOutputs,
  outputDirectories,
} from "../../compiler-output/emit.js";

/** A path tsc writes that the build restores when it does not finish. */
export type CompilerOutput = {
  readonly path: string;
  readonly kind: "directory" | "build-info" | "file";
};

const optionalString = (value: unknown) =>
  typeof value === "string" ? value : undefined;
const optionalBoolean = (value: unknown) =>
  typeof value === "boolean" ? value : undefined;

export type ShownConfig = {
  readonly options: EmitOptions & { readonly incremental?: boolean };
  /** As printed: with no `exclude` of its own, tsc's default, which names the output directories. */
  readonly exclude: readonly string[] | undefined;
  readonly references: readonly string[];
};

const strings = (value: unknown) =>
  Array.isArray(value) && value.every((entry) => typeof entry === "string")
    ? (value as string[])
    : undefined;

/** The config in `tsc --showConfig` output, or undefined when it is not JSON. */
export function parseShownConfig(text: string): ShownConfig | undefined {
  let shown: unknown;
  try {
    shown = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (typeof shown !== "object" || shown === null) return undefined;
  const { compilerOptions, exclude, references } = shown as Record<
    string,
    unknown
  >;
  return {
    options: emitOptions(compilerOptions),
    exclude: strings(exclude),
    references: Array.isArray(references)
      ? references.flatMap((reference: unknown) => {
          const path = (reference as { path?: unknown } | null)?.path;
          return typeof path === "string" ? [path] : [];
        })
      : [],
  };
}

function emitOptions(options: unknown): ShownConfig["options"] {
  if (typeof options !== "object" || options === null) return {};
  const record = options as Record<string, unknown>;
  return {
    declaration: optionalBoolean(record.declaration),
    composite: optionalBoolean(record.composite),
    incremental: optionalBoolean(record.incremental),
    declarationDir: optionalString(record.declarationDir),
    outDir: optionalString(record.outDir),
    outFile: optionalString(record.outFile),
    rootDir: optionalString(record.rootDir),
    tsBuildInfoFile: optionalString(record.tsBuildInfoFile),
    noEmit: optionalBoolean(record.noEmit),
    emitDeclarationOnly: optionalBoolean(record.emitDeclarationOnly),
    sourceMap: optionalBoolean(record.sourceMap),
    declarationMap: optionalBoolean(record.declarationMap),
  };
}

/**
 * What the root project's tsc writes inside the package, for the build to
 * snapshot and restore: its build info first, then the files `outFile`
 * writes, then its declaration and output directories, the build's own
 * output directory or one holding it included. A directory holding
 * `buildDirectory`, where the build keeps its runs and their snapshots, is
 * left out and unprotected, as without staging: a snapshot of it would copy
 * itself. This says what to protect, not what to carry into the stage.
 */
export function compilerOutputInventory(
  options: EmitOptions,
  at: {
    readonly configFile: string;
    readonly packageRoot: string;
    readonly buildDirectory: string;
  },
): CompilerOutput[] {
  const inPackage = (path: string) => Boolean(pathWithin(at.packageRoot, path));
  const directories = outputDirectories(options, dirname(at.configFile))
    .filter(inPackage)
    .filter((dir) => pathWithin(dir, at.buildDirectory) === null);
  return [
    ...[buildInfoFile(options, at.configFile)]
      .filter(inPackage)
      .map((path) => ({ path, kind: "build-info" as const })),
    ...outFileOutputs(options, at.configFile)
      .filter(inPackage)
      .map((path) => ({ path, kind: "file" as const })),
    ...[...new Set(directories)].map((path) => ({
      path,
      kind: "directory" as const,
    })),
  ];
}
