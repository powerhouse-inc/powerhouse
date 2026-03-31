import { DEFAULT_DRIVE_EDITOR_ID } from "../constants.js";
import type { VetraEditorModule } from "../types/vetra.js";
import { useVetraPackages } from "./vetra-packages.js";

export function useEditorModules(): VetraEditorModule[] | undefined {
  const vetraPackages = useVetraPackages();
  return vetraPackages
    ?.flatMap((pkg) => pkg.modules.editorModules || [])
    .filter(
      (module) => !module.documentTypes.includes("powerhouse/document-drive"),
    );
}

export function useAppModules(): VetraEditorModule[] | undefined {
  const vetraPackages = useVetraPackages();
  return vetraPackages
    ?.flatMap((pkg) => pkg.modules.editorModules || [])
    .filter((module) =>
      module.documentTypes.includes("powerhouse/document-drive"),
    );
}

export function useFallbackEditorModule(
  documentType: string | null | undefined,
): VetraEditorModule | undefined {
  const editorModules = useEditorModules();
  if (!documentType) return undefined;
  if (editorModules?.length === 0) return undefined;

  const modulesForType = editorModules?.filter((module) =>
    module.documentTypes.includes(documentType),
  );
  return modulesForType?.[0];
}

export function useAppModuleById(
  id: string | null | undefined,
): VetraEditorModule | undefined {
  const appModules = useAppModules();
  return appModules?.find((module) => module.id === id);
}

export function useDefaultAppModule(): VetraEditorModule | undefined {
  const defaultAppModule = useAppModuleById(DEFAULT_DRIVE_EDITOR_ID);
  return defaultAppModule;
}

export function useEditorModuleById(
  id: string | null | undefined,
): VetraEditorModule | undefined {
  const editorModules = useEditorModules();
  return editorModules?.find((module) => module.id === id);
}

export function useEditorModulesForDocumentType(
  documentType: string | null | undefined,
) {
  const editorModules = useEditorModules();
  if (!documentType) return undefined;

  const modulesForType = editorModules?.filter((module) =>
    module.documentTypes.includes(documentType),
  );
  return modulesForType;
}
