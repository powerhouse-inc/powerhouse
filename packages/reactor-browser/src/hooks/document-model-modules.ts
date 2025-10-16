import type { VetraDocumentModelModule } from "@powerhousedao/reactor-browser";
import { useVetraPackages } from "./vetra-packages.js";

export function useDocumentModelModules():
  | VetraDocumentModelModule[]
  | undefined {
  const vetraPackages = useVetraPackages();
  return vetraPackages?.flatMap(
    (pkg) => pkg.modules.documentModelModules || [],
  );
}

export function useDocumentModelModuleById(
  id: string | null | undefined,
): VetraDocumentModelModule | undefined {
  const documentModelModules = useDocumentModelModules();
  return documentModelModules?.find((module) => module.id === id);
}
