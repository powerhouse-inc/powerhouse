import { useAtomValue } from "jotai";
import { useCallback } from "react";
import { DEFAULT_DRIVE_EDITOR_ID } from "../constants.js";
import {
  loadableDocumentModelModulesAtom,
  loadableDriveEditorModulesAtom,
  loadableEditorModulesAtom,
  unwrappedDocumentModelModulesAtom,
  unwrappedDriveEditorModulesAtom,
  unwrappedEditorModulesAtom,
  unwrappedVetraPackagesAtom,
} from "../internal/atoms.js";
import { dispatchUpdateVetraPackagesEvent } from "../internal/events.js";
import { type VetraPackage } from "../types.js";
export function useVetraPackages() {
  return useAtomValue(unwrappedVetraPackagesAtom);
}

export function useUpdateVetraPackages() {
  return useCallback((vetraPackages: VetraPackage[] | undefined) => {
    window.vetraPackages = vetraPackages;
    dispatchUpdateVetraPackagesEvent(vetraPackages);
  }, []);
}

export function useDocumentModelModules() {
  return useAtomValue(unwrappedDocumentModelModulesAtom);
}

export function useLoadableDocumentModelModules() {
  return useAtomValue(loadableDocumentModelModulesAtom);
}

export function useEditorModules() {
  return useAtomValue(unwrappedEditorModulesAtom);
}

export function useLoadableEditorModules() {
  return useAtomValue(loadableEditorModulesAtom);
}

export function useDriveEditorModules() {
  return useAtomValue(unwrappedDriveEditorModulesAtom);
}

export function useLoadableDriveEditorModules() {
  return useAtomValue(loadableDriveEditorModulesAtom);
}

export function useDocumentModelModuleById(id: string | null | undefined) {
  const documentModelModules = useDocumentModelModules();
  return documentModelModules?.find((module) => module.id === id);
}

export function useEditorModuleById(id: string | null | undefined) {
  const editorModules = useEditorModules();
  return editorModules?.find((module) => module.id === id);
}

export function useFallbackEditorModule(
  documentType: string | null | undefined,
) {
  const editorModules = useEditorModules();
  if (!documentType) return undefined;
  const modulesForType = editorModules?.filter((module) =>
    module.documentTypes.includes(documentType),
  );
  return modulesForType?.[0];
}

export function useDriveEditorModuleById(id: string | null | undefined) {
  const driveEditorModules = useDriveEditorModules();
  return driveEditorModules?.find((module) => module.id === id);
}

export function useDefaultDriveEditorModule() {
  const defaultDriveEditorModule = useDriveEditorModuleById(
    DEFAULT_DRIVE_EDITOR_ID,
  );
  return defaultDriveEditorModule;
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
