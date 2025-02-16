import stringify from "json-stringify-deterministic";
import { gql, requestGraphql } from "../../../utils/graphql";
import { logger } from "../../../utils/logger";
import { ListenerRevision, StrandUpdate } from "../../types";
import { ITransmitter, StrandUpdateSource } from "./types";

export class SwitchboardPushTransmitter implements ITransmitter {
  private targetURL: string;
  private debugID = `[SPT #${Math.floor(Math.random() * 999)}]`;

  constructor(targetURL: string) {
    this.targetURL = targetURL;
  }

  private debugLog(...data: any[]) {
    if (data.length > 0 && typeof data[0] === "string") {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      console.log(`${this.debugID} ${data[0]}`, ...data.slice(1));
    } else {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      console.log(this.debugID, ...data);
    }
  }

  async transmit(
    strands: StrandUpdate[],
    source: StrandUpdateSource,
  ): Promise<ListenerRevision[]> {
    if (
      source.type === "trigger" &&
      source.trigger.data?.url === this.targetURL
    ) {
      this.debugLog(`Cutting trigger loop from ${this.targetURL}.`);
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
