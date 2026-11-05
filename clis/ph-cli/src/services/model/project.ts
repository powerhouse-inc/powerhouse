import {
  uncachedDefinitionSourceRevision,
  ViteTypeScriptSourceImportAdapter,
} from "@powerhousedao/codegen/utils";
import {
  DefinitionSourceLoader,
  loadProjectDefinitions,
  type ProjectDefinitions,
} from "document-model/tooling";
import { join } from "node:path";

/** Imports more of the package through the importer that loaded its definitions. */
export type ProjectModules = {
  readonly importModule: (
    specifier: `./${string}`,
  ) => Promise<Readonly<Record<string, unknown>>>;
};

/**
 * Loads the package's definitions with codegen's Vite importer, hands them to
 * `read`, then disposes the loader. The package's own modules are imported
 * into this process: `ph model` runs it in its own process, `ph build` in the
 * definitions worker.
 */
export async function readProjectDefinitions<R>(
  projectRoot: string,
  read: (
    project: ProjectDefinitions,
    modules: ProjectModules,
  ) => R | Promise<R>,
): Promise<R> {
  const importer = new ViteTypeScriptSourceImportAdapter();
  const loader = new DefinitionSourceLoader(importer);
  const packageRevision = uncachedDefinitionSourceRevision();
  try {
    const project = await loadProjectDefinitions({
      loader,
      configFile: join(projectRoot, "powerhouse.config.json"),
      packageRevision,
      importedFiles: (specifier) => importer.filesImportedBy(specifier),
    });
    return await read(project, {
      importModule: (specifier) =>
        importer.importModule({
          packageRoot: project.packageRoot,
          specifier,
          packageRevision,
        }),
    });
  } finally {
    await loader.dispose();
  }
}
