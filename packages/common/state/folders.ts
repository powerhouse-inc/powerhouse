import { type FolderNode } from "document-drive";
import { useAtomValue } from "jotai";
import {
  loadableSelectedFolderAtom,
  unwrappedSelectedFolderAtom,
} from "./atoms.js";

export function useSelectedFolder() {
  return useAtomValue(loadableSelectedFolderAtom);
}

export function useUnwrappedSelectedFolder(): FolderNode | undefined {
  return useAtomValue(unwrappedSelectedFolderAtom);
}
