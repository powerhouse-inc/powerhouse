import { type DocumentDriveDocument } from "document-drive";
import { ProcessorManager } from "document-drive/processors/processor-manager";
import { useAtom, useAtomValue } from "jotai";
import { useEffect } from "react";
import { processorManagerAtom } from "./atoms.js";
import { useUnwrappedReactor } from "./reactor.js";

export function useProcessorManager() {
  return useAtomValue(processorManagerAtom);
}

export function useInitializeProcessorManager() {
  const reactor = useUnwrappedReactor();
  const [processorManager, setProcessorManager] = useAtom(processorManagerAtom);

  useEffect(() => {
    // wait for reactor to be initialized
    if (!reactor) return;
    // return if already initialized
    if (processorManager) return;

    const initializedProcessManager = new ProcessorManager(
      reactor.listeners,
      reactor,
    );
    reactor.on("driveAdded", async (drive: DocumentDriveDocument) => {
      await initializedProcessManager.registerDrive(drive.id);
    });
    setProcessorManager(initializedProcessManager);
  }, [processorManager, reactor, setProcessorManager]);
}
