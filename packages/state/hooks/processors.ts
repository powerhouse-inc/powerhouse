import { useAtomValue } from "jotai";
import {
  loadableProcessorManagerAtom,
  unwrappedProcessorManagerAtom,
} from "../internal/atoms.js";

export function useLoadableProcessorManager() {
  return useAtomValue(loadableProcessorManagerAtom);
}

export function useProcessorManager() {
  return useAtomValue(unwrappedProcessorManagerAtom);
}
