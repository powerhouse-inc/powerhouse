import type {
  GraphQLResult,
  IListenerManager,
  ITransmitter,
  ListenerRevision,
  StrandUpdate,
  StrandUpdateSource,
} from "document-drive";
import {
  childLogger,
  gql,
  operationsToRevision,
  requestGraphql,
} from "document-drive";
import stringify from "json-stringify-deterministic";

const SYNC_OPS_BATCH_LIMIT = 10;

export class SwitchboardPushTransmitter implements ITransmitter {
  private targetURL: string;
  private manager?: IListenerManager;
  private logger = childLogger([
    "SwitchboardPushTransmitter",
    Math.floor(Math.random() * 999).toString(),
  ]);

  constructor(targetURL: string, manager?: IListenerManager) {
    this.targetURL = targetURL;
    this.manager = manager;
  }

  private async getAuthHeaders(): Promise<Record<string, string>> {
    if (!this.manager?.generateJwtHandler) {
      this.logger.verbose(`No JWT handler available for ${this.targetURL}`);
      return {};
    }
    try {
      const jwt = await this.manager.generateJwtHandler(this.targetURL);
      if (!jwt) {
        this.logger.verbose(`No JWT generated for ${this.targetURL}`);
        return {};
      }
      return { Authorization: `Bearer ${jwt}` };
    } catch (error) {
      this.logger.error(`Error generating JWT for ${this.targetURL}:`, error);
      return {};
    }
  }

  private async requestWithAuth<T>(
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<GraphQLResult<T>> {
    const headers = await this.getAuthHeaders();
    const result = await requestGraphql<T>(
      this.targetURL,
      query,
      variables,
      headers,
    );

    // Check for unauthorized error
    const error = result.errors?.at(0);
    if (error?.message.includes("Unauthorized")) {
      // Retry once with fresh JWT
      const freshHeaders = await this.getAuthHeaders();
      return requestGraphql<T>(this.targetURL, query, variables, freshHeaders);
    }

    return result;
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

      return strands.map((strand) => {
        return {
          driveId: strand.driveId,
          documentId: strand.documentId,
          documentType: strand.documentType,
          scope: strand.scope,
          branch: strand.branch,
          status: "SUCCESS",
          revision: operationsToRevision(strand.operations),
        };
      });
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
      const result = await this.requestWithAuth<{
        pushUpdates: ListenerRevision[];
      }>(
        gql`
          mutation pushUpdates($strands: [InputStrandUpdate!]) {
            pushUpdates(strands: $strands) {
              driveId
              documentId
              documentType
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
            driveId: strand.driveId,
            documentId: strand.documentId,
            documentType: strand.documentType,
            scope: strand.scope,
            branch: strand.branch,
            operations: strand.operations.map((op) => ({
              index: op.index,
              skip: op.skip,
              type: op.type,
              id: op.id ?? undefined,
              actionId: op.actionId,
              input: stringify(op.input),
              hash: op.hash,
              timestampUtcMs: op.timestampUtcMs,
              context: op.context
                ? {
                    signer: op.context.signer,
                  }
                : undefined,
            })),
          })),
        },
      );

      if (!result.pushUpdates) {
        throw new Error("Couldn't update listener revision");
      }

      return result.pushUpdates;
    } catch (e) {
      this.logger.error(e);
      throw e;
    }
  }
}
