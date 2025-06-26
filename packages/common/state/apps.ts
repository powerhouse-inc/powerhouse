import { type App } from "document-model";
import { atom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useMemo } from "react";

export const genericDriveExplorer: App = {
  id: "powerhouse/common",
  name: "Generic Drive Explorer",
  driveEditor: "GenericDriveExplorer",
};

const appMapAtom = atom<Map<string, App>>(
  new Map([[genericDriveExplorer.id, genericDriveExplorer]]),
);
appMapAtom.debugLabel = "appMapAtom";

const setAppMapAtom = atom(null, (get, set, input: App[]) => {
  const prevMap = get(appMapAtom);
  const newMap = makeAppMap(input);
  set(appMapAtom, newMap);
});
setAppMapAtom.debugLabel = "setAppMapAtom";

const getAppByIdAtom = atom((get) => {
  const appMap = get(appMapAtom);
  return (id: string) => appMap.get(id);
});
getAppByIdAtom.debugLabel = "getAppByIdAtom";

function makeAppMap(input: App[]) {
  const appMap = new Map<string, App>();
  for (const app of input) {
    appMap.set(app.id, app);
  }
  return appMap;
}

function makeAppNamesByDriveEditorMap(input: App[]) {
  const appNamesByDriveEditorMap = new Map<string, string>();
  for (const app of input) {
    if (app.driveEditor) {
      appNamesByDriveEditorMap.set(app.driveEditor, app.name);
    }
  }
  return appNamesByDriveEditorMap;
}

function useUpdateAppMap() {
  return useSetAtom(setAppMapAtom);
}

export function useApps() {
  const appMap = useAtomValue(appMapAtom);
  return useMemo(() => Array.from(appMap.values()), [appMap]);
}

function useAppNamesByDriveEditorMap() {
  const apps = useApps();
  return useMemo(() => makeAppNamesByDriveEditorMap(apps), [apps]);
}

export function useGetAppNameForEditorId() {
  const appNamesByDriveEditorMap = useAppNamesByDriveEditorMap();
  return useCallback(
    (editorId?: string) => {
      if (!editorId) return undefined;
      return appNamesByDriveEditorMap.get(editorId);
    },
    [appNamesByDriveEditorMap],
  );
}
