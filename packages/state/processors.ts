import { type DocumentDriveDocument } from "document-drive";
import { ProcessorManager } from "document-drive/processors/processor-manager";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";
import {
  initializeProcessorManagerAtom,
  loadableProcessorManagerAtom,
  unwrappedProcessorManagerAtom,
} from "./atoms.js";
import { useUnwrappedReactor } from "./reactor.js";

export function useProcessorManager() {
  return useAtomValue(loadableProcessorManagerAtom);
}

export function useUnwrappedProcessorManager() {
  return useAtomValue(unwrappedProcessorManagerAtom);
}

export function useSetProcessorManager() {
  return useSetAtom(initializeProcessorManagerAtom);
}

export function useInitializeProcessorManager() {
  const reactor = useUnwrappedReactor();
  const processorManager = useUnwrappedProcessorManager();
  const setProcessorManager = useSetProcessorManager();

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
      await initializedProcessManager.registerDrive(drive.header.id);
    });
    setProcessorManager(initializedProcessManager);
  }, [processorManager, reactor, setProcessorManager]);
}
