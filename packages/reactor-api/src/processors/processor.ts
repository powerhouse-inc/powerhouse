import {
  IDocumentDriveServer,
  InternalTransmitterUpdate,
} from "document-drive";
import { BaseDocument, OperationScope } from "document-model";
import { IProcessor, ProcessorOptions, ProcessorSetupArgs } from "../types.js";

export type ProcessorUpdate<
  D extends BaseDocument<unknown, unknown> = BaseDocument<unknown, unknown>,
  S extends OperationScope = OperationScope,
> = InternalTransmitterUpdate<D, S>;

export abstract class Processor<
  D extends BaseDocument<unknown, unknown> = BaseDocument<unknown, unknown>,
  S extends OperationScope = OperationScope,
> implements IProcessor
{
  protected reactor: IDocumentDriveServer;
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

  constructor(args: ProcessorSetupArgs, options?: ProcessorOptions) {
    this.reactor = args.reactor;
    if (options) {
      this.processorOptions = { ...this.processorOptions, ...options };
    }
  }

  onSetup(args: ProcessorSetupArgs): void {
    this.reactor = args.reactor;
  }

  abstract onStrands(strands: ProcessorUpdate<D, S>[]): Promise<void>;

  abstract onDisconnect(): Promise<void>;

  getOptions() {
    return this.processorOptions;
  }
}

export class BaseProcessor extends Processor {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async onStrands(strands: ProcessorUpdate[]): Promise<void> {}
  async onDisconnect(): Promise<void> {}
}

export type ProcessorClass = typeof BaseProcessor;

// checks if the provided candidate is a descendant of the Processor class.
export function isProcessorClass(
  candidate: unknown,
): candidate is ProcessorClass {
  if (typeof candidate !== "function") return false;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  let proto = Object.getPrototypeOf(candidate);

  while (proto) {
    if (Object.prototype.isPrototypeOf.call(proto, Processor)) return true;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    proto = Object.getPrototypeOf(proto);
  }

  return false;
}
