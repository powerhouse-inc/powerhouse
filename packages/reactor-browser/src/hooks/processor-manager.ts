import { subscribeToProcessorManager } from "@powerhousedao/reactor-browser";
import type { ProcessorManager } from "document-drive";
import { useSyncExternalStore } from "react";

export function useProcessorManager(): ProcessorManager | undefined {
  const processorManager = useSyncExternalStore(
    subscribeToProcessorManager,
    () => window.phProcessorManager,
  );
  return processorManager;
}
