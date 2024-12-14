import {
  PullResponderTriggerData,
  Trigger,
} from "document-model-libs/document-drive";
import { GetStrandsOptions, ListenerRevision, StrandUpdate } from "../..";
import { Listener } from "./types";
import { logger } from "../utils/logger";

export type StrandUpdateSource =
  | {
      type: "local";
    }
  | { type: "trigger"; trigger: Trigger };

export interface ITransmitter {
  disconnect?(): Promise<void>;
}

export interface IPushTransmitter extends ITransmitter {
  transmit(
    strands: StrandUpdate[],
    source: StrandUpdateSource,
  ): Promise<ListenerRevision[]>;
}

export interface IPullTransmitter extends ITransmitter {
  getStrands(options?: GetStrandsOptions): Promise<StrandUpdate[]>;
}

export type PullResponderTrigger = Omit<Trigger, "data" | "type"> & {
  data: PullResponderTriggerData;
  type: "PullResponder";
};

export interface ITransmitterManager {
  createTransmitter(listener: Listener): ITransmitter;
  getTransmitter(listenerId: string): ITransmitter;
  deleteTransmitter(listenerId: string): boolean;
}

export class PushTransmitter implements IPushTransmitter {
  transmit(
    strands: StrandUpdate[],
    source: StrandUpdateSource,
  ): Promise<ListenerRevision[]> {
    return Promise.resolve([]);
  }
  disconnect(): Promise<void> {
    return Promise.resolve();
  }
}

export class PullTransmitter implements IPullTransmitter {
  getStrands(options?: GetStrandsOptions): Promise<StrandUpdate[]> {
    throw new Error("Method not implemented.");
  }
  disconnect?(): Promise<void> {
    throw new Error("Method not implemented.");
  }
}

export class TransmitterManager implements ITransmitterManager {
  private transmitters = new Map<string, ITransmitter>();

  createTransmitter(listener: Listener): ITransmitter {
    if (this.transmitters.has(listener.id)) {
      throw new Error(
        `Transmitter for listener ${listener.id} already exists.`,
      );
    }

    let transmitter: ITransmitter;
    const transmitterType = listener.callInfo?.transmitterType;
    switch (transmitterType) {
      case "SwitchboardPush":
        transmitter = new PushTransmitter();
        break;
      case "PullResponder":
        transmitter = new PullTransmitter();
        break;
      case undefined:
        throw new Error(
          `Transmitter type not specified for listener ${listener.id}`,
        );
      default:
        throw new Error(`Unsupported transmitter type: ${transmitterType}`);
    }

    this.transmitters.set(listener.id, transmitter);
    return transmitter;
  }

  getTransmitter(listenerId: string): ITransmitter {
    const transmitter = this.transmitters.get(listenerId);
    if (!transmitter) {
      throw new Error(`Transmitter for listener ${listenerId} not found.`);
    }
    return transmitter;
  }

  deleteTransmitter(listenerId: string): boolean {
    const transmitter = this.transmitters.get(listenerId);
    transmitter?.disconnect?.().catch((error: unknown) => {
      logger.warn("Error disconnecting transmitter", error);
    });

    return this.transmitters.delete(listenerId);
  }
}
