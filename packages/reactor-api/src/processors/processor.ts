import {
  IBaseDocumentDriveServer,
  InternalTransmitterUpdate,
} from "document-drive";
import { Document, OperationScope } from "document-model/document";
import { IProcessor, ProcessorOptions, ProcessorSetupArgs } from "src/types";

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
  }

  abstract onStrands(strands: ProcessorUpdate<D, S>[]): Promise<void>;

  abstract onDisconnect(): Promise<void>;

  getOptions() {
    return this.processorOptions;
  }

  onSetup(args: ProcessorSetupArgs) {
    this.reactor = args.reactor;
  }
}
