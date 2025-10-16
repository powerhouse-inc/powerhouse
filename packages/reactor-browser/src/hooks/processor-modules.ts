import type { Processors, VetraProcessorModule } from "../types/vetra.js";
import { useVetraPackages } from "./vetra-packages.js";

export function useProcessorModules(): VetraProcessorModule[] | undefined {
  const vetraPackages = useVetraPackages();
  return vetraPackages
    ?.flatMap((pkg) => pkg.modules.processorModules)
    .filter((module) => module !== undefined) as VetraProcessorModule[];
}

export function useProcessors(): Processors[] | undefined {
  const processorModules = useProcessorModules();
  return processorModules?.flatMap((module) => module.processors);
}
