import {
  type ListenerFilter,
  type PullResponderTriggerData,
  type Trigger,
} from "#drive-document-model";
import { type ListenerRevision, type StrandUpdate } from "#server";

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
  driveId: string;
  filter: ListenerFilter;
  data: PullResponderTriggerData;
  type: "PullResponder";
};
