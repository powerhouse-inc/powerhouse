import {
  IDocumentDriveServer,
  InternalTransmitterUpdate,
} from "document-drive";
import { PHDocument } from "document-model";
import { IProcessor, ProcessorOptions, ProcessorSetupArgs } from "../types.js";

export type ProcessorUpdate<TDocument extends PHDocument> =
  InternalTransmitterUpdate<TDocument>;

export abstract class Processor implements IProcessor {
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

  abstract onStrands<TDocument extends PHDocument>(
    strands: ProcessorUpdate<TDocument>[],
  ): Promise<void>;

  abstract onDisconnect(): Promise<void>;

  getOptions() {
    return this.processorOptions;
  }
}

export class BaseProcessor extends Processor {
  async onStrands<TDocument extends PHDocument>(
    strands: ProcessorUpdate<TDocument>[],
  ): Promise<void> {}
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
