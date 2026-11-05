import { basename, dirname, extname, relative, resolve } from "node:path";

/** The compiler options that say where tsc writes, as `tsc --showConfig` prints them. */
export type EmitOptions = {
  readonly declaration?: boolean;
  readonly composite?: boolean;
  readonly declarationDir?: string;
  readonly outDir?: string;
  readonly outFile?: string;
  readonly rootDir?: string;
  readonly tsBuildInfoFile?: string;
  readonly noEmit?: boolean;
  readonly emitDeclarationOnly?: boolean;
  readonly sourceMap?: boolean;
  readonly declarationMap?: boolean;
};

const withoutExtension = (path: string) => path.replace(/\.[^./\\]+$/, "");

const declares = (options: EmitOptions) =>
  options.declaration === true || options.composite === true;

/**
 * Where tsc keeps the build info of `configFile`, by TypeScript's rule:
 * `tsBuildInfoFile`; else beside `outFile`; else in `outDir`, at the
 * config's place relative to `rootDir` when that is set; else beside the
 * config.
 */
export function buildInfoFile(
  options: EmitOptions,
  configFile: string,
): string {
  const configDir = dirname(configFile);
  const name = `${basename(configFile, extname(configFile))}.tsbuildinfo`;
  if (options.tsBuildInfoFile !== undefined) {
    return resolve(configDir, options.tsBuildInfoFile);
  }
  if (options.outFile !== undefined) {
    return resolve(
      configDir,
      `${withoutExtension(options.outFile)}.tsbuildinfo`,
    );
  }
  if (options.outDir === undefined) return resolve(configDir, name);
  const fromRoot =
    options.rootDir === undefined
      ? ""
      : relative(resolve(configDir, options.rootDir), configDir);
  return resolve(configDir, options.outDir, fromRoot, name);
}

/**
 * The files tsc writes for `outFile`: the bundle and its map unless it
 * emits declarations only, then the declaration and its map when it
 * declares. None without `outFile` or with `noEmit`.
 */
export function outFileOutputs(
  options: EmitOptions,
  configFile: string,
): string[] {
  if (options.outFile === undefined || options.noEmit) return [];
  const output = resolve(dirname(configFile), options.outFile);
  const files: string[] = [];
  if (!options.emitDeclarationOnly) {
    files.push(output, ...(options.sourceMap ? [`${output}.map`] : []));
  }
  if (declares(options)) {
    const declaration = `${withoutExtension(output)}.d.ts`;
    files.push(
      declaration,
      ...(options.declarationMap ? [`${declaration}.map`] : []),
    );
  }
  return files;
}

/** The declaration and output directories the options name, resolved. */
export function outputDirectories(
  options: EmitOptions,
  configDir: string,
): string[] {
  return [options.declarationDir, options.outDir]
    .filter((dir): dir is string => dir !== undefined)
    .map((dir) => resolve(configDir, dir));
}

/** Where tsc writes declarations, when it writes them to a directory of their own. */
export function declarationDirectory(
  options: EmitOptions,
  configDir: string,
): string | undefined {
  const dir = options.declarationDir ?? options.outDir;
  if (!dir || !declares(options)) return undefined;
  return resolve(configDir, dir);
}
