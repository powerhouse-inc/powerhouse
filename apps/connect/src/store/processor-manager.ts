import { setProcessorManager } from "@powerhousedao/reactor-browser/connect";
import type { IDocumentDriveServer } from "document-drive";
import { ProcessorManager, childLogger } from "document-drive";

const logger = childLogger(["processor-manager"]);

export function initProcessorManager(reactor: IDocumentDriveServer) {
  const processorManager = new ProcessorManager(reactor.listeners, reactor);

  setProcessorManager(processorManager);

  reactor.on("driveAdded", (...args) => {
    // register the drive with the processor manager
    processorManager.registerDrive(args[0].header.id).catch(logger.error);
  });

  return processorManager;
}
