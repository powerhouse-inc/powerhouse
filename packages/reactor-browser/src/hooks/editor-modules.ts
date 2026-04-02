import type { EditorModule } from "document-model";
import { DEFAULT_DRIVE_EDITOR_ID } from "../constants.js";
import { useVetraPackages } from "./vetra-packages.js";

export function useEditorModules(): EditorModule[] | undefined {
  const vetraPackages = useVetraPackages();
  return vetraPackages
    .flatMap((pkg) => pkg.editors)
    .filter(
      (module) => !module.documentTypes.includes("powerhouse/document-drive"),
    );
}

export function useAppModules(): EditorModule[] | undefined {
  const vetraPackages = useVetraPackages();
  return vetraPackages
    .flatMap((pkg) => pkg.editors)
    .filter((module) =>
      module.documentTypes.includes("powerhouse/document-drive"),
    );
}

export function useFallbackEditorModule(
  documentType: string | null | undefined,
): EditorModule | undefined {
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
): EditorModule | undefined {
  const appModules = useAppModules();
  return appModules?.find((module) => module.config.id === id);
}

export function useDefaultAppModule(): EditorModule | undefined {
  const defaultAppModule = useAppModuleById(DEFAULT_DRIVE_EDITOR_ID);
  return defaultAppModule;
}

export function useEditorModuleById(
  id: string | null | undefined,
): EditorModule | undefined {
  const editorModules = useEditorModules();
  return editorModules?.find((module) => module.config.id === id);
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
