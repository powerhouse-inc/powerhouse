import { useAtomValue } from "jotai";
import { hmrAtom } from "../internal/atoms.js";

export function useHmr() {
  const hmr = useAtomValue(hmrAtom);
  return hmr;
}
