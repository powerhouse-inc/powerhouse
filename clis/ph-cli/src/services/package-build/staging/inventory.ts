import { dirname, isAbsolute, relative, sep } from "node:path";
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

/** The options in `tsc --showConfig` output, or undefined when it is not JSON. */
export function parseShownConfig(text: string): EmitOptions | undefined {
  let shown: unknown;
  try {
    shown = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (typeof shown !== "object" || shown === null) return undefined;
  const options = (shown as { compilerOptions?: unknown }).compilerOptions;
  if (typeof options !== "object" || options === null) return {};
  const record = options as Record<string, unknown>;
  return {
    declaration: optionalBoolean(record.declaration),
    composite: optionalBoolean(record.composite),
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

function inside(root: string, path: string): boolean {
  const rel = relative(root, path);
  return (
    rel !== "" &&
    rel !== ".." &&
    !rel.startsWith(`..${sep}`) &&
    !isAbsolute(rel)
  );
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
  const inPackage = (path: string) => inside(at.packageRoot, path);
  const directories = outputDirectories(options, dirname(at.configFile))
    .filter(inPackage)
    .filter(
      (dir) => dir !== at.buildDirectory && !inside(dir, at.buildDirectory),
    );
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
