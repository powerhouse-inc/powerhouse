import { type Processor } from "@powerhousedao/reactor-api";
import { codegenProcessorFactory } from "@powerhousedao/vetra/processors";

const PROCESSOR_KEYS = {
  CODEGEN: "ph/codegen/processor",
} as const;

export const DEFAULT_PROCESSORS: Record<string, Processor> = {
  [PROCESSOR_KEYS.CODEGEN]: [codegenProcessorFactory],
};

export type DefaultProcessors =
  (typeof PROCESSOR_KEYS)[keyof typeof PROCESSOR_KEYS];
