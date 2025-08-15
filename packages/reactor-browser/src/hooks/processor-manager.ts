import { type ProcessorManager } from "document-drive";
import { useSyncExternalStore } from "react";
import { subscribeToProcessorManager } from "../events/index.js";

export function useProcessorManager(): ProcessorManager | undefined {
  const processorManager = useSyncExternalStore(
    subscribeToProcessorManager,
    () => window.phProcessorManager,
  );
  return processorManager;
}
