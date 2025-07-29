import { type ProcessorManager } from "document-drive/processors/processor-manager";
import { useAtomValue } from "jotai";
import {
  loadableProcessorManagerAtom,
  loadableProcessorsAtom,
  unwrappedProcessorManagerAtom,
  unwrappedProcessorsAtom,
} from "../internal/atoms.js";
import { type Loadable } from "../internal/types.js";
import { type Processors } from "../types.js";

export function useLoadableProcessorManager(): Loadable<
  ProcessorManager | undefined
> {
  return useAtomValue(loadableProcessorManagerAtom);
}

export function useProcessorManager(): ProcessorManager | undefined {
  return useAtomValue(unwrappedProcessorManagerAtom);
}

export function useProcessors(): Processors[] | undefined {
  return useAtomValue(unwrappedProcessorsAtom);
}

export function useLoadableProcessors() {
  return useAtomValue(loadableProcessorsAtom);
}
