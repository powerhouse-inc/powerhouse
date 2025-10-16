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

export function useDriveEditorModules(): VetraEditorModule[] | undefined {
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

export function useDriveEditorModuleById(
  id: string | null | undefined,
): VetraEditorModule | undefined {
  const driveEditorModules = useDriveEditorModules();
  return driveEditorModules?.find((module) => module.id === id);
}

export function useDefaultDriveEditorModule(): VetraEditorModule | undefined {
  const defaultDriveEditorModule = useDriveEditorModuleById(
    DEFAULT_DRIVE_EDITOR_ID,
  );
  return defaultDriveEditorModule;
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
