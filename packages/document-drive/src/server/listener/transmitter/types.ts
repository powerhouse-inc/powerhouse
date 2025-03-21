import {
  type PullResponderTriggerData,
  type Trigger,
} from "#drive-document-model/gen/types";
import { type ListenerRevision, type StrandUpdate } from "#server/types";

export type StrandUpdateSource =
  | {
      type: "local";
    }
  | { type: "trigger"; trigger: Trigger };

export interface ITransmitter {
  transmit?(
    strands: StrandUpdate[],
    source: StrandUpdateSource,
  ): Promise<ListenerRevision[]>;
  disconnect?(): Promise<void>;
}
export interface InternalTransmitterService extends ITransmitter {
  getName(): string;
}

export type PullResponderTrigger = Omit<Trigger, "data" | "type"> & {
  data: PullResponderTriggerData;
  type: "PullResponder";
};
