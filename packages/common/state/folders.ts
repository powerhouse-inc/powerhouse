import { type FolderNode } from "document-drive";
import { useAtomValue } from "jotai";
import {
  loadableSelectedFolderAtom,
  unwrappedSelectedFolderAtom,
} from "./atoms.js";

/** Returns a loadable of the selected folder. */
export function useSelectedFolder() {
  return useAtomValue(loadableSelectedFolderAtom);
}

/** Returns a resolved promise of the selected folder. */
export function useUnwrappedSelectedFolder(): FolderNode | undefined {
  return useAtomValue(unwrappedSelectedFolderAtom);
}
