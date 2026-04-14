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

export function useDocumentModelModuleById(
  id: string | null | undefined,
): DocumentModelModule | undefined {
  const documentModelModules = useDocumentModelModules();
  return documentModelModules?.find(
    (module) => module.documentModel.global.id === id,
  );
}
