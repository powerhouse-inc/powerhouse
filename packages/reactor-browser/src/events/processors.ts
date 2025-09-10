import type { ProcessorManager } from "document-drive";
import type { SetProcessorManagerEvent } from "./types.js";

export function dispatchSetProcessorManagerEvent(
  processorManager: ProcessorManager | undefined,
) {
  const event = new CustomEvent("ph:setProcessorManager", {
    detail: { processorManager },
  });
  window.dispatchEvent(event);
}
export function dispatchProcessorManagerUpdatedEvent() {
  const event = new CustomEvent("ph:processorManagerUpdated");
  window.dispatchEvent(event);
}
export function handleSetProcessorManagerEvent(
  event: SetProcessorManagerEvent,
) {
  const processorManager = event.detail.processorManager;
  window.phProcessorManager = processorManager;
  dispatchProcessorManagerUpdatedEvent();
}
export function subscribeToProcessorManager(onStoreChange: () => void) {
  window.addEventListener("ph:processorManagerUpdated", onStoreChange);
  return () => {
    window.removeEventListener("ph:processorManagerUpdated", onStoreChange);
  };
}

export function addProcessorManagerEventHandler() {
  window.addEventListener(
    "ph:setProcessorManager",
    handleSetProcessorManagerEvent,
  );
}
