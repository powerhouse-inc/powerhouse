import { type DocumentModelLib } from "document-model";
import { useAtomValue, useSetAtom } from "jotai";
import { type Loadable } from "jotai/vanilla/utils/loadable";
import { useEffect } from "react";
import {
  loadablePhPackagesAtom,
  phPackagesAtom,
  unwrappedPhPackagesAtom,
} from "./atoms.js";
import { type DriveEditorModule } from "./types.js";

export type PHPackage = DocumentModelLib & { id: string };

export function useInitializePHPackages(
  loadExternalPackages: () => Promise<PHPackage[]>,
) {
  const setPhPackages = useSetAtom(phPackagesAtom);
  useEffect(() => {
    setPhPackages(loadExternalPackages);
  }, []);
}

export function usePhPackages() {
  return useAtomValue(loadablePhPackagesAtom);
}

export function useUnwrappedPhPackages() {
  return useAtomValue(unwrappedPhPackagesAtom);
}

export function useDriveEditor(
  editorId?: string,
): Loadable<DriveEditorModule | undefined> {
  const phPackages = useUnwrappedPhPackages();
  if (!editorId) return { state: "hasData", data: undefined };
  const pkg = phPackages?.find((pkg) =>
    pkg.manifest.apps?.find((app) => app.driveEditor === editorId),
  );
  const driveEditorModule = pkg?.editors.find(
    (editor) => editor.config.id === editorId,
  );
  if (!driveEditorModule) return { state: "hasData", data: undefined };
  return { state: "hasData", data: driveEditorModule as DriveEditorModule };
}
