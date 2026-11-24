import {
  uncachedDefinitionSourceRevision,
  ViteTypeScriptSourceImportAdapter,
} from "./definition-source-importer.js";
import {
  DefinitionSourceLoader,
  loadProjectDefinitions,
  type ProjectDefinitions,
  type TypeScriptSourceImportInterface,
} from "document-model/tooling";
import { join } from "node:path";

/** Imports more of the package through the importer that loaded its definitions. */
export type ProjectModules = {
  readonly importModule: (
    specifier: `./${string}`,
  ) => Promise<Readonly<Record<string, unknown>>>;
  /** Absolute paths of every module the import of `specifier` evaluated. None when it was not imported or its import failed. */
  readonly importedFiles: (specifier: string) => readonly string[];
};

/** An import that starts after the abort would open a server nothing closes. */
function refusingImportsAfterAbort(
  importer: ViteTypeScriptSourceImportAdapter,
  signal: AbortSignal,
): TypeScriptSourceImportInterface {
  return {
    importModule: async (request) => {
      signal.throwIfAborted();
      return await importer.importModule(request);
    },
    disposeRevision: (revision) => importer.disposeRevision(revision),
  };
}

/**
 * Loads the package's definitions with codegen's Vite importer, hands them to
 * `read`, then disposes the loader. The package's own modules are imported
 * into the calling process. Aborting `signal` disposes the loader at once, for a
 * caller that cannot wait for an import that never settles.
 */
export async function readProjectDefinitions<R>(
  projectRoot: string,
  read: (
    project: ProjectDefinitions,
    modules: ProjectModules,
  ) => R | Promise<R>,
  options: {
    readonly allowMissingConfig?: boolean;
    readonly signal?: AbortSignal;
  } = {},
): Promise<R> {
  const importer = new ViteTypeScriptSourceImportAdapter();
  const { signal } = options;
  const loader = new DefinitionSourceLoader(
    signal === undefined
      ? importer
      : refusingImportsAfterAbort(importer, signal),
  );
  const packageRevision = uncachedDefinitionSourceRevision();
  // A pending import keeps the `finally` below from ever running.
  const disposeOnAbort = () => void loader.dispose().catch(() => undefined);
  signal?.addEventListener("abort", disposeOnAbort, { once: true });
  try {
    signal?.throwIfAborted();
    const project = await loadProjectDefinitions({
      loader,
      configFile: join(projectRoot, "powerhouse.config.json"),
      ...(options.allowMissingConfig === true && { allowMissingConfig: true }),
      packageRevision,
      ...(signal !== undefined && { signal }),
      importedFiles: (specifier) => importer.filesImportedBy(specifier),
    });
    return await read(project, {
      importedFiles: (specifier) => importer.filesImportedBy(specifier),
      importModule: (specifier) =>
        importer.importModule({
          packageRoot: project.packageRoot,
          specifier,
          packageRevision,
        }),
    });
  } finally {
    signal?.removeEventListener("abort", disposeOnAbort);
    await loader.dispose();
  }
}
