import { useAtomValue, useSetAtom } from "jotai";
import { permissionsAtom } from "./atoms.js";

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
