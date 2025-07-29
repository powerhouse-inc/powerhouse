import { type DocumentModelModule, type EditorModule } from "document-model";
import { useAtomValue } from "jotai";
import { useCallback } from "react";
import {
  loadableAppsAtom,
  loadableDocumentModelModulesAtom,
  loadableEditorModulesAtom,
  unwrappedAppsAtom,
  unwrappedDocumentModelModulesAtom,
  unwrappedEditorModulesAtom,
  unwrappedPHPackagesAtom,
} from "../internal/atoms.js";
import { dispatchUpdatePHPackagesEvent } from "../internal/events.js";
import { type PHPackage } from "../types.js";
export function usePHPackages() {
  return useAtomValue(unwrappedPHPackagesAtom);
}

export function useUpdatePHPackages() {
  return useCallback((phPackages: PHPackage[] | undefined) => {
    window.phPackages = phPackages;
    dispatchUpdatePHPackagesEvent(phPackages);
  }, []);
}

export function useDocumentModelModules(): DocumentModelModule[] | undefined {
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

export function useDocumentModelModuleById<
  T extends DocumentModelModule = DocumentModelModule,
>(id: string | null | undefined) {
  const documentModelModules = useDocumentModelModules();
  return documentModelModules?.find(
    (module) => module.documentModel.id === id,
  ) as T | undefined;
}

export function useEditorModuleById<T extends EditorModule = EditorModule>(
  id: string | null | undefined,
) {
  const editorModules = useEditorModules();
  return editorModules?.find((module) => module.config.id === id) as
    | T
    | undefined;
}

export function useEditorModuleByDocumentType<
  T extends EditorModule = EditorModule,
>(documentType: string | null | undefined) {
  const editorModules = useEditorModules();
  const modulesForType = editorModules?.filter(
    (module) => module.config.documentType === documentType,
  );
  if (!modulesForType) return undefined;
  if (modulesForType.length !== 1) {
    console.warn(
      `Multiple editor modules found for document type ${documentType}`,
      "Returning first module",
      modulesForType,
    );
  }
  return modulesForType[0] as T | undefined;
}

export function useDocumentModelModuleByDocumentType<
  T extends DocumentModelModule = DocumentModelModule,
>(documentType: string | null | undefined) {
  const documentModelModules = useDocumentModelModules();
  const modulesForType = documentModelModules?.filter(
    (module) => module.documentModel.id === documentType,
  );
  if (modulesForType && modulesForType.length > 1) {
    console.warn(
      `Multiple document model modules found for document type ${documentType}`,
      "Returning first module",
      modulesForType,
    );
  }
  return modulesForType?.[0] as T | undefined;
}

export function useApps() {
  return useAtomValue(unwrappedAppsAtom);
}

export function useLoadableApps() {
  return useAtomValue(loadableAppsAtom);
}

export function useDriveEditor(
  preferredDriveEditorId: string | null | undefined,
) {
  const apps = useApps();
  const editorModules = useEditorModules();
  if (!preferredDriveEditorId) return undefined;
  const appWithDriveEditorForPreferredEditorId = apps?.find(
    (app) => app.driveEditor === preferredDriveEditorId,
  );
  if (!appWithDriveEditorForPreferredEditorId) return undefined;
  const appDriveEditorId = appWithDriveEditorForPreferredEditorId.driveEditor;
  const editorModuleForAppDriveEditorId = editorModules?.find(
    (editor) => editor.config.id === appDriveEditorId,
  );
  return editorModuleForAppDriveEditorId;
}
