import stringify from "json-stringify-deterministic";
import { gql, requestGraphql } from "#utils/graphql";
import { logger } from "#utils/logger";
import { ListenerRevision, StrandUpdate } from "#server/types";
import { ITransmitter, StrandUpdateSource } from "./types.js";

const ENABLE_SYNC_DEBUG = false;
const SYNC_OPS_BATCH_LIMIT = 10;

export class SwitchboardPushTransmitter implements ITransmitter {
  private targetURL: string;
  private debugID = `[SPT #${Math.floor(Math.random() * 999)}]`;

  constructor(targetURL: string) {
    this.targetURL = targetURL;
  }

  private debugLog(...data: any[]) {
    if (!ENABLE_SYNC_DEBUG) {
      return false;
    }

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

    const culledStrands: StrandUpdate[] = [];
    let opsCounter = 0;

    for (
      let s = 0;
      opsCounter <= SYNC_OPS_BATCH_LIMIT && s < strands.length;
      s++
    ) {
      const currentStrand = strands.at(s);
      if (!currentStrand) {
        break;
      }
      const newOps = Math.min(
        SYNC_OPS_BATCH_LIMIT - opsCounter,
        currentStrand.operations.length,
      );

      culledStrands.push({
        ...currentStrand,
        operations: currentStrand.operations.slice(0, newOps),
      });

      opsCounter += newOps;
    }

    this.debugLog(
      ` Total update: [${strands.map((s) => s.operations.length).join(", ")}] operations`,
    );

    this.debugLog(
      `Culled update: [${culledStrands.map((s) => s.operations.length).join(", ")}] operations`,
    );

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
          strands: culledStrands.map((strand) => ({
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
