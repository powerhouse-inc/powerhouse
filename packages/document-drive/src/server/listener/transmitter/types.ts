import type {
  GetStrandsOptions,
  ListenerFilter,
  ListenerRevision,
  OperationUpdate,
  PullResponderTriggerData,
  StrandUpdate,
  Trigger,
} from "document-drive";
import type {
  GlobalStateFromDocument,
  LocalStateFromDocument,
  Operation,
  PHDocument,
} from "document-model";

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

export type InternalOperationUpdate<TDocument extends PHDocument> = Omit<
  Operation,
  "scope"
> & {
  state: GlobalStateFromDocument<TDocument> | LocalStateFromDocument<TDocument>;
  previousState:
    | GlobalStateFromDocument<TDocument>
    | LocalStateFromDocument<TDocument>;
};

export type InternalTransmitterUpdate<TDocument extends PHDocument> = {
  driveId: string;
  documentId: string;
  documentType: string;
  scope: string;
  branch: string;
  operations: InternalOperationUpdate<TDocument>[];
  state: GlobalStateFromDocument<TDocument> | LocalStateFromDocument<TDocument>;
};

export type OperationUpdateGraphQL = Omit<OperationUpdate, "input"> & {
  input: string;
};

export type PullStrandsGraphQL = {
  system: {
    sync: {
      strands: StrandUpdateGraphQL[];
    };
  };
};

export type CancelPullLoop = () => void;

export type StrandUpdateGraphQL = Omit<StrandUpdate, "operations"> & {
  operations: OperationUpdateGraphQL[];
};

export interface IPullResponderTransmitter extends ITransmitter {
  getStrands(options?: GetStrandsOptions): Promise<StrandUpdate[]>;
}
