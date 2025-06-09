import { atom, useAtomValue, useSetAtom } from "jotai";

export const permissionsAtom = atom({
  isAllowedToCreateDocuments: false,
  isAllowedToEditDocuments: false,
});

export function usePermissions() {
  return useAtomValue(permissionsAtom);
}

export function useIsAllowedToCreateDocuments() {
  const permissions = usePermissions();
  return permissions.isAllowedToCreateDocuments;
}

export function useIsAllowedToEditDocuments() {
  const permissions = usePermissions();
  return permissions.isAllowedToEditDocuments;
}

export function useSetPermissions() {
  const setPermissions = useSetAtom(permissionsAtom);
  return setPermissions;
}
