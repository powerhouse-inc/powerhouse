import { type ProcessorManager } from "document-drive/processors/processor-manager";
import { useAtomValue } from "jotai";
import {
  loadableProcessorManagerAtom,
  loadableProcessorModulesAtom,
  unwrappedProcessorManagerAtom,
  unwrappedProcessorModulesAtom,
} from "../internal/atoms.js";
import { type Loadable } from "../internal/types.js";

export function useLoadableProcessorManager(): Loadable<
  ProcessorManager | undefined
> {
  return useAtomValue(loadableProcessorManagerAtom);
}

export function useProcessorManager(): ProcessorManager | undefined {
  return useAtomValue(unwrappedProcessorManagerAtom);
}

export function useProcessorModules() {
  return useAtomValue(unwrappedProcessorModulesAtom);
}

export function useLoadableProcessorModules() {
  return useAtomValue(loadableProcessorModulesAtom);
}

export function useProcessorModuleById(id: string | null | undefined) {
  const processorModules = useProcessorModules();
  return processorModules?.find((module) => module.id === id);
}

export function useProcessors() {
  const processorModules = useProcessorModules();
  return processorModules?.map((module) => module.processors);
}
