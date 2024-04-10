import stringify from 'json-stringify-deterministic';
import { gql, requestGraphql } from '../../../utils/graphql';
import {
    BaseDocumentDriveServer,
    Listener,
    ListenerRevision,
    Logger,
    StrandUpdate
} from '../../types';
import { ITransmitter } from './types';

export class SwitchboardPushTransmitter extends Logger implements ITransmitter {
    private drive: BaseDocumentDriveServer;
    private listener: Listener;
    private targetURL: string;

    constructor(listener: Listener, drive: BaseDocumentDriveServer) {
        super();
        this.listener = listener;
        this.drive = drive;
        this.targetURL = listener.callInfo!.data!;
    }

    async transmit(strands: StrandUpdate[]): Promise<ListenerRevision[]> {
        // Send Graphql mutation to switchboard
        try {
            const { pushUpdates } = await requestGraphql<{
                pushUpdates: ListenerRevision[];
            }>(
                this.targetURL,
                gql`
                    mutation pushUpdates($strands: [InputStrandUpdate!]) {
                        pushUpdates(strands: $strands) {
                            driveId
                            documentId
                            scope
                            branch
                            status
                            revision
                            error
                        }
                    }
                `,
                {
                    strands: strands.map(strand => ({
                        ...strand,
                        operations: strand.operations.map(op => ({
                            ...op,
                            input: stringify(op.input)
                        }))
                    }))
                }
            );

            if (!pushUpdates) {
                throw new Error("Couldn't update listener revision");
            }

            return pushUpdates;
        } catch (e) {
            this.logger.error(e);
            throw e;
        }
        return [];
    }
}
