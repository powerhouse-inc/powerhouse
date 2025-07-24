import { type DocumentDriveDocument } from "document-drive";
import { ProcessorManager } from "document-drive/processors/processor-manager";
import { useAtom, useAtomValue } from "jotai";
import { useEffect } from "react";
import {
  baseProcessorManagerAtom,
  loadableProcessorManagerAtom,
  unwrappedProcessorManagerAtom,
} from "./atoms.js";
import { useUnwrappedReactor } from "./reactor.js";
import { NOT_SET } from "./utils.js";

export function useProcessorManager() {
  return useAtomValue(loadableProcessorManagerAtom);
}

export function useUnwrappedProcessorManager() {
  return useAtomValue(unwrappedProcessorManagerAtom);
}

export function useInitializeProcessorManager() {
  const reactor = useUnwrappedReactor();
  const [processorManager, setProcessorManager] = useAtom(
    baseProcessorManagerAtom,
  );

  useEffect(() => {
    // return if already initialized
    if (processorManager !== NOT_SET) return;
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
  }, [processorManager, reactor, setProcessorManager]);
}
