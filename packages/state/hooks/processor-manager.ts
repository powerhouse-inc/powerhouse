import { type ProcessorManager } from "document-drive/processors/processor-manager";
import { useSyncExternalStore } from "react";
import { subscribeToProcessorManager } from "../internal/events.js";

export function useProcessorManager(): ProcessorManager | undefined {
  const processorManager = useSyncExternalStore(
    subscribeToProcessorManager,
    () => window.phProcessorManager,
  );
  return processorManager;
}
