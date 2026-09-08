import type {
  DefinitionCheckProfile,
  DefinitionCheckReport,
  DefinitionInspectionReport,
  DefinitionInspectionSelection,
  DefinitionSourceDiagnostic,
  DefinitionSourceLoadResult,
  TypeScriptSourceImportInterface,
} from "document-model/tooling";
import { validateSubgraphProfile } from "@powerhousedao/reactor-api";
import {
  checkDefinitions,
  DefinitionSourceLoader,
  inspectDefinitions,
} from "document-model/tooling";
import { createHash } from "node:crypto";
import { dirname, relative, resolve } from "node:path";
import { parse } from "graphql";
import { ViteTypeScriptSourceImportAdapter } from "./definition-import-vite.js";
import {
  readFileTree,
  toPosixPath,
  updateLengthPrefixedHash,
} from "./file-tree.js";

export type DefinitionSourceCommandArgs = {
  readonly configFile: string;
  readonly sources: readonly string[];
  readonly warningsAsErrors?: boolean;
  readonly signal?: AbortSignal;
  readonly outputDirectories?: readonly string[];
};

type DefinitionImportDependencies = {
  readonly importer?: TypeScriptSourceImportInterface;
};

export function resolveSelectedDefinitionSourcePaths(request: {
  readonly configFile: string;
  readonly sources: readonly string[];
}): readonly string[] {
  const configFile = resolve(request.configFile);
  const packageRoot = dirname(configFile);
  const loader = new DefinitionSourceLoader({
    importModule: () =>
      Promise.reject(
        new Error("Source path resolution does not import modules."),
      ),
  });
  return loader
    .resolve({ configFile, cliSources: request.sources })
    .sourceSet.sources.map(({ specifier }) =>
      resolve(packageRoot, ...specifier.slice(2).split("/")),
    );
}

const REVISION_IGNORED_DIRECTORY_NAMES = new Set([
  ".git",
  ".hg",
  ".svn",
  "node_modules",
]);

const REVISION_IGNORED_ROOT_DIRECTORIES = new Set([
  ".evidence",
  ".next",
  ".ph",
  ".tsbuild",
  ".turbo",
  "coverage",
]);

function normalizedOutputDirectories(
  packageRoot: string,
  outputDirectories: readonly string[],
): Set<string> {
  const result = new Set<string>(["dist"]);
  for (const directory of outputDirectories) {
    const absolute = resolve(packageRoot, directory);
    const logicalPath = toPosixPath(relative(packageRoot, absolute));
    if (
      logicalPath !== "" &&
      logicalPath !== ".." &&
      !logicalPath.startsWith("../")
    ) {
      result.add(logicalPath.replace(/\/$/, ""));
    }
  }
  return result;
}

function packageRevisionIgnoredPaths(
  packageRoot: string,
  outputDirectories: readonly string[],
): readonly string[] {
  const ignoredOutputs = normalizedOutputDirectories(
    packageRoot,
    outputDirectories,
  );
  return [
    ...[...REVISION_IGNORED_ROOT_DIRECTORIES].map((name) =>
      resolve(packageRoot, name),
    ),
    ...[...ignoredOutputs].map((path) => resolve(packageRoot, path)),
  ];
}

/**
 * Hashes the package build graph independently of definition export selection.
 * The normalized selection is bound separately by `sourceSet.digest`.
 * In-package file symlinks bind both their link identity and target bytes;
 * directory, dangling, and package-external symlinks are rejected.
 */
export async function createDefinitionPackageRevision(request: {
  readonly configFile: string;
  readonly outputDirectories?: readonly string[];
}): Promise<`sha256:${string}`> {
  const configFile = resolve(request.configFile);
  const packageRoot = dirname(configFile);
  const hash = createHash("sha256");
  hash.update("powerhouse-definition-package-revision-v3\0", "utf8");
  const entries = await readFileTree(
    packageRoot,
    (path) => {
      const logicalPath = toPosixPath(relative(packageRoot, path)) || ".";
      return new Error(
        `Definition package revision cannot safely include the symbolic link at ${logicalPath}. Use an in-package link to a regular file, or replace the link.`,
      );
    },
    {
      ignoredDirectoryNames: REVISION_IGNORED_DIRECTORY_NAMES,
      ignoredPaths: packageRevisionIgnoredPaths(
        packageRoot,
        request.outputDirectories ?? [],
      ),
      symlinks: "internal-files",
    },
  );
  for (const entry of entries) {
    updateLengthPrefixedHash(
      hash,
      toPosixPath(relative(packageRoot, entry.path)),
    );
    updateLengthPrefixedHash(hash, entry.kind);
    if (entry.kind === "symlink") {
      updateLengthPrefixedHash(hash, entry.linkTarget);
      updateLengthPrefixedHash(hash, entry.targetPath);
    }
    updateLengthPrefixedHash(hash, entry.contents);
  }
  return `sha256:${hash.digest("hex")}`;
}

async function withLoadedDefinitions<T>(
  args: DefinitionSourceCommandArgs,
  callback: (loadResult: DefinitionSourceLoadResult) => T | Promise<T>,
  dependencies: DefinitionImportDependencies = {},
): Promise<T> {
  const ownedImporter = dependencies.importer
    ? undefined
    : new ViteTypeScriptSourceImportAdapter();
  const importer = dependencies.importer ?? ownedImporter;
  if (!importer) throw new TypeError("A definition importer is required.");
  const loader = new DefinitionSourceLoader(importer);

  try {
    const resolution = loader.resolve({
      configFile: args.configFile,
      cliSources: args.sources,
    });
    if (resolution.status !== "ready") {
      return callback({ ...resolution, values: [] });
    }
    const revisionFailure = (
      base: DefinitionSourceLoadResult,
      code: `PH-${string}`,
      message: string,
      repair: string,
    ): DefinitionSourceLoadResult => {
      const diagnostic: DefinitionSourceDiagnostic = {
        code,
        severity: "error",
        phase: "import",
        path: ["packageRevision"],
        message,
        repair,
      };
      return {
        ...base,
        status: "failed",
        diagnostics: [...base.diagnostics, diagnostic],
        values: [],
      };
    };

    let packageRevision: `sha256:${string}`;
    try {
      packageRevision = await createDefinitionPackageRevision({
        configFile: args.configFile,
        outputDirectories: args.outputDirectories,
      });
    } catch {
      return callback(
        revisionFailure(
          { ...resolution, values: [] },
          "PH-PKG-SOURCE-REVISION-FAILED",
          "The package source tree could not be read safely before import.",
          "Remove unsafe links or concurrent source writes, then retry the definition check.",
        ),
      );
    }
    const loadResult = await loader.load({
      configFile: args.configFile,
      cliSources: args.sources,
      packageRevision,
      signal: args.signal,
    });
    let confirmedRevision: `sha256:${string}`;
    try {
      confirmedRevision = await createDefinitionPackageRevision({
        configFile: args.configFile,
        outputDirectories: args.outputDirectories,
      });
    } catch {
      return callback(
        revisionFailure(
          loadResult,
          "PH-PKG-SOURCE-REVISION-FAILED",
          "The package source tree could not be read safely after import.",
          "Stop concurrent source writes, remove unsafe links, and retry the definition check.",
        ),
      );
    }
    if (confirmedRevision !== packageRevision) {
      return callback(
        revisionFailure(
          loadResult,
          "PH-PKG-SOURCE-REVISION-CHANGED",
          "The package source tree changed while definitions were being imported.",
          "Retry after source writes have finished so one immutable revision can be checked.",
        ),
      );
    }
    return callback(loadResult);
  } finally {
    await ownedImporter?.close();
  }
}

const legacyGraphQLParser = { parse };

export function runDefinitionCheck(
  args: DefinitionSourceCommandArgs & {
    readonly profile: DefinitionCheckProfile;
  },
  dependencies: DefinitionImportDependencies = {},
): Promise<DefinitionCheckReport> {
  return withLoadedDefinitions(
    args,
    (loadResult) =>
      checkDefinitions(
        {
          formatVersion: 1,
          profile: args.profile,
          warningsAsErrors: args.warningsAsErrors,
          loadResult,
        },
        {
          legacyGraphQLParser,
          subgraphProfileValidator: validateSubgraphProfile,
        },
      ),
    dependencies,
  );
}

export function runDefinitionInspection(
  args: DefinitionSourceCommandArgs & {
    readonly compilerVersion: string;
    readonly selection: DefinitionInspectionSelection;
  },
  dependencies: DefinitionImportDependencies = {},
): Promise<DefinitionInspectionReport> {
  return withLoadedDefinitions(
    args,
    (loadResult) =>
      inspectDefinitions(
        {
          formatVersion: 1,
          profile: "edit",
          warningsAsErrors: args.warningsAsErrors,
          compilerVersion: args.compilerVersion,
          selection: args.selection,
          loadResult,
        },
        { legacyGraphQLParser },
      ),
    dependencies,
  );
}
