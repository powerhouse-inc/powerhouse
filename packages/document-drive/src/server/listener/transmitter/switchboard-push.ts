import stringify from "json-stringify-deterministic";
import { gql, requestGraphql } from "#utils/graphql";
import { childLogger } from "#utils/logger";
import { type ListenerRevision, type StrandUpdate } from "#server/types";
import { type ITransmitter, type StrandUpdateSource } from "./types.js";

const SYNC_OPS_BATCH_LIMIT = 10;

export class SwitchboardPushTransmitter implements ITransmitter {
  private targetURL: string;
  private logger = childLogger([
    "SwitchboardPushTransmitter",
    Math.floor(Math.random() * 999).toString(),
  ]);

  constructor(targetURL: string) {
    this.targetURL = targetURL;
  }

  async transmit(
    strands: StrandUpdate[],
    source: StrandUpdateSource,
  ): Promise<ListenerRevision[]> {
    if (
      source.type === "trigger" &&
      source.trigger.data?.url === this.targetURL
    ) {
      this.logger.verbose(`Cutting trigger loop from ${this.targetURL}.`);

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

    this.logger.verbose(
      ` Total update: [${strands.map((s) => s.operations.length).join(", ")}] operations`,
    );

    this.logger.verbose(
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
      this.logger.error(e);
      throw e;
    }
    return [];
  }
}
