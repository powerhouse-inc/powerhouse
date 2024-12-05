import {
  IDocumentDriveServer,
  InternalTransmitter,
  InternalTransmitterUpdate
} from "document-drive";
import { DocumentDriveDocument } from "document-model-libs/document-drive";
import { Processor, ProcessorFactory } from "./processors";
import { ProcessorType } from "./types";


export class ProcessorManager {
  private driveServer: IDocumentDriveServer;
  private modules: Processor[] = [];
  private processorFactory: ProcessorFactory;

  constructor(driveServer: IDocumentDriveServer, processorFactory: ProcessorFactory) {
    this.driveServer = driveServer;
    this.processorFactory = processorFactory;
    driveServer.on("driveAdded", this.#onDriveAdded.bind(this));
  }

  async #onDriveAdded(drive: DocumentDriveDocument) {
    await Promise.all(
      this.modules.map((module) =>
        this.driveServer.addInternalListener(
          drive.state.global.id,
          {
            transmit: (strands) => module.transmit(strands),
            disconnect: async () => {
              return Promise.resolve();
            },
          },
          { ...module.getOptions() },
        ),
      ),
    );
  }

  async init() {
    // @todo: init all processors
  }

  async registerProcessorType(module: ProcessorType<Processor>) {
    const processor = await this.processorFactory.create(module);
    this.modules = this.modules.filter((m) => m.getOptions().listenerId !== module.OPTIONS.listenerId);
    this.modules.push(processor);
  }
}
