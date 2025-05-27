import { atom, useAtomValue, useSetAtom } from "jotai";

export const selectedDriveIdAtom = atom<string | null>(null);
export function useSelectedDriveId() {
  const selectedDriveId = useAtomValue(selectedDriveIdAtom);
  return selectedDriveId;
}

export function useSetSelectedDriveId() {
  const setSelectedDriveId = useSetAtom(selectedDriveIdAtom);
  return setSelectedDriveId;
}
