import { type DocumentDriveDocument } from "document-drive";
import { ProcessorManager } from "document-drive/processors/processor-manager";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";
import {
  loadableProcessorManagerAtom,
  processorManagerAtom,
  processorManagerInitializedAtom,
  unwrappedProcessorManagerAtom,
} from "./atoms.js";
import { useUnwrappedReactor } from "./reactor.js";

export function useProcessorManager() {
  return useAtomValue(loadableProcessorManagerAtom);
}

export function useUnwrappedProcessorManager() {
  return useAtomValue(unwrappedProcessorManagerAtom);
}

export function useInitializeProcessorManager() {
  const reactor = useUnwrappedReactor();
  const processorManagerInitialized = useAtomValue(
    processorManagerInitializedAtom,
  );
  const setProcessorManager = useSetAtom(processorManagerAtom);

  useEffect(() => {
    // return if already initialized
    if (processorManagerInitialized) return;
    // wait for reactor to be initialized
    if (!reactor) return;

    const initializedProcessManager = new ProcessorManager(
      reactor.listeners,
      reactor,
    );
    reactor.on("driveAdded", async (drive: DocumentDriveDocument) => {
      await initializedProcessManager.registerDrive(drive.header.id);
    });
    setProcessorManager(initializedProcessManager);
  }, [processorManagerInitialized, reactor, setProcessorManager]);
}
