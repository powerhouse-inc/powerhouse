import stringify from "json-stringify-deterministic";
import { gql, requestGraphql } from "@utils/graphql";
import { logger } from "@utils/logger";
import {
  IBaseDocumentDriveServer,
  Listener,
  ListenerRevision,
  StrandUpdate,
} from "@server/types";
import { ITransmitter, StrandUpdateSource } from "@server/listener/transmitter/types";

export class SwitchboardPushTransmitter implements ITransmitter {
  private drive: IBaseDocumentDriveServer;
  private listener: Listener;
  private targetURL: string;

  constructor(listener: Listener, drive: IBaseDocumentDriveServer) {
    this.listener = listener;
    this.drive = drive;
    this.targetURL = listener.callInfo!.data!;
  }

  async transmit(
    strands: StrandUpdate[],
    source: StrandUpdateSource,
  ): Promise<ListenerRevision[]> {
    if (
      source.type === "trigger" &&
      source.trigger.data?.url === this.targetURL
    ) {
      return strands.map((strand) => ({
        driveId: strand.driveId,
        documentId: strand.documentId,
        scope: strand.scope,
        branch: strand.branch,
        status: "SUCCESS",
        revision: strand.operations.at(-1)?.index ?? -1,
      }));
    }

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
          strands: strands.map((strand) => ({
            ...strand,
            operations: strand.operations.map((op) => ({
              ...op,
              input: stringify(op.input),
            })),
          })),
        },
      );

      if (!pushUpdates) {
        throw new Error("Couldn't update listener revision");
      }

      return pushUpdates;
    } catch (e) {
      logger.error(e);
      throw e;
    }
    return [];
  }
}
