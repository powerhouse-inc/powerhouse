import { useCallback } from "react";
import { CommonPackage } from "../internal/constants.js";
import { dispatchUpdatePHPackagesEvent } from "../internal/events.js";
import { type PHPackage } from "../internal/types.js";
export function usePHPackages() {
  return window.phPackages;
}

export function useUpdatePHPackages() {
  return useCallback((phPackages: PHPackage[] | undefined) => {
    window.phPackages = phPackages;
    dispatchUpdatePHPackagesEvent(phPackages);
  }, []);
}

export function useDocumentModelModules() {
  const phPackages = usePHPackages();
  return phPackages
    ?.flatMap((phPackage) => phPackage.documentModels)
    .filter((module) => module !== undefined);
}

export function useEditorModules() {
  const phPackages = usePHPackages();
  return phPackages
    ?.flatMap((phPackage) => phPackage.editors)
    .filter((module) => module !== undefined);
}

export function useDocumentModelModuleById(id: string | null | undefined) {
  const documentModelModules = useDocumentModelModules();
  return documentModelModules?.find((module) => module.documentModel.id === id);
}

export function useEditorModuleById(id: string | null | undefined) {
  const editorModules = useEditorModules();
  return editorModules?.find((module) => module.config.id === id);
}

export function useApps() {
  const phPackages = usePHPackages();
  const appsFromPHPackages =
    phPackages
      ?.flatMap((phPackage) => phPackage.manifest?.apps)
      .filter((app) => app !== undefined) ?? [];
  return [CommonPackage, ...appsFromPHPackages];
}

export function useDriveEditor(editorId: string | null | undefined) {
  const phPackages = usePHPackages();
  if (!editorId) return undefined;
  const pkg = phPackages?.find((pkg) =>
    pkg.manifest?.apps?.find((app) => app.driveEditor === editorId),
  );
  return pkg?.editors?.find((editor) => editor.config.id === editorId);
}
