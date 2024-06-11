import {
    PullResponderTriggerData,
    Trigger
} from 'document-model-libs/document-drive';
import { ListenerRevision, StrandUpdate } from '../..';

export interface ITransmitter {
    transmit(strands: StrandUpdate[]): Promise<ListenerRevision[]>;
    disconnect?(): Promise<void>;
}

export interface InternalTransmitterService extends ITransmitter {
    getName(): string;
}

export type PullResponderTrigger = Omit<Trigger, 'data' | 'type'> & {
    data: PullResponderTriggerData;
    type: 'PullResponder';
};
