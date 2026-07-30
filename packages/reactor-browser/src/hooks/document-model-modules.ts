import type { DocumentModelModule } from "document-model";
import { useVetraPackages } from "./vetra-packages.js";

export function useDocumentModelModules(): DocumentModelModule[] | undefined {
  const vetraPackages = useVetraPackages();
  return vetraPackages
    .flatMap((pkg) => pkg.documentModels)
    .filter(
      (module, index, modules) =>
        // deduplicate by documentType and version
        modules.findIndex(
          (m) =>
            m.documentModel.global.id === module.documentModel.global.id &&
            m.version === module.version,
        ) === index,
    );
}

/**
 * Resolves a document model module by document type, mirroring the registry's
 * semantics (`IDocumentModelRegistry.getModule`): with `version` omitted the
 * LATEST version of the type wins (`version ?? 1` as each module's default),
 * with `version` given only an exact match is returned. The reactor resolves
 * modules the same way when a document is created, so metadata read through
 * this hook and the version a creation actually uses cannot disagree.
 */
export function useDocumentModelModuleById(
  id: string | null | undefined,
  version?: number,
): DocumentModelModule | undefined {
  const documentModelModules = useDocumentModelModules();
  if (!id || !documentModelModules) return undefined;

  let latestModule: DocumentModelModule | undefined;
  let latestVersion = -1;
  for (const module of documentModelModules) {
    if (module.documentModel.global.id !== id) continue;
    const moduleVersion = module.version ?? 1;
    if (version !== undefined) {
      if (moduleVersion === version) return module;
      continue;
    }
    if (moduleVersion > latestVersion) {
      latestVersion = moduleVersion;
      latestModule = module;
    }
  }
  return latestModule;
}
