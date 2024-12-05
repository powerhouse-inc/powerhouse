import {
  IBaseDocumentDriveServer,
  InternalTransmitterUpdate,
} from "document-drive";
import { Document, OperationScope } from "document-model/document";
import { IProcessor, ProcessorOptions } from "src/types";

export type ProcessorUpdate<
  D extends Document = Document,
  S extends OperationScope = OperationScope,
> = InternalTransmitterUpdate<D, S>;

export abstract class Processor<
  D extends Document = Document,
  S extends OperationScope = OperationScope,
> implements IProcessor<D, S>
{
  protected processorOptions: ProcessorOptions = {
    listenerId: "processor",
    filter: {
      branch: ["main"],
      documentId: ["*"],
      documentType: ["*"],
      scope: ["global"],
    },
    block: false,
    label: "processor",
    system: true,
  };

  constructor(
    protected reactor: IBaseDocumentDriveServer,
    options?: ProcessorOptions,
  ) {
    if (options) {
      this.processorOptions = options;
    }
    // this.#registerProcessor().catch((e: unknown) => {
    //   throw e;
    // });
  }

  //   async #registerProcessor() {
  //     const drives = await this.reactor.getDrives();
  //     for (const drive of drives) {
  //       const transmitter = await this.reactor.getTransmitter(
  //         drive,
  //         this.processorOptions.listenerId,
  //       );
  //       if (transmitter) continue;
  //       await this.reactor.addInternalListener(
  //         drive,
  //         this,
  //         this.processorOptions,
  //       );
  //     }
  //   }

  abstract onStrands(strands: ProcessorUpdate<D, S>[]): Promise<void>;

  abstract onDisconnect(): Promise<void>;

  getOptions() {
    return this.processorOptions;
  }
}
