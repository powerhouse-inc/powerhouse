import {
  AnalyticsPath,
  type AnalyticsSeriesInput,
} from "@powerhousedao/analytics-engine-core";
import { type IAnalyticsStore } from "@powerhousedao/reactor-api";
import { DateTime } from "@powerhousedao/reactor-browser/analytics";
import { childLogger } from "document-drive";
import { type IProcessor } from "document-drive/processors/types";
import { type InternalTransmitterUpdate } from "document-drive/server/listener/transmitter/internal";
import type { PHDocument } from "document-model";

const CREATE_NODE_ACTIONS = ["ADD_FILE", "ADD_FOLDER", "COPY_NODE"];
const UPDATE_NODE_ACTIONS = ["UPDATE_FILE", "UPDATE_NODE", "MOVE_NODE"];
const DELETE_NODE_ACTIONS = ["DELETE_NODE"];

const NODE_ACTIONS = [
  ...CREATE_NODE_ACTIONS,
  ...UPDATE_NODE_ACTIONS,
  ...DELETE_NODE_ACTIONS,
];

export type Target = "DRIVE" | "NODE";
export type ActionType = "CREATE" | "UPDATE" | "DELETE";

export class DriveAnalyticsProcessor implements IProcessor {
  constructor(
    private readonly analyticsStore: IAnalyticsStore,
    private readonly logger = childLogger(["processor", "drive-analytics"]),
  ) {
    //
  }

  async onStrands<TDocument extends PHDocument>(
    strands: InternalTransmitterUpdate<TDocument>[],
  ): Promise<void> {
    if (strands.length === 0) {
      return;
    }

    for (const strand of strands) {
      // skip empty strands
      if (strand.operations.length === 0) {
        continue;
      }

      const firstOp = strand.operations[0];
      const source = AnalyticsPath.fromString(
        `ph/${strand.documentId}/${strand.branch}/${strand.scope}`,
      );

      if (firstOp.index === 0) {
        await this.clearSource(source);
      }

      const { documentId, branch, scope } = strand;

      const CHUNK_SIZE = 50;
      for (let i = 0; i < strand.operations.length; i += CHUNK_SIZE) {
        const chunk = strand.operations.slice(i, i + CHUNK_SIZE);

        const buffer: AnalyticsSeriesInput[] = [];

        for (const operation of chunk) {
          const revision = operation.index;
          const actionType = this.getActionType(operation.type);
          const target: Target = NODE_ACTIONS.includes(operation.type)
            ? "NODE"
            : "DRIVE";

          const seriesInput: AnalyticsSeriesInput = {
            source,
            metric: "DriveOperations",
            start: DateTime.fromISO(operation.timestamp),
            value: 1,
            dimensions: {
              document: AnalyticsPath.fromString(
                `document/${documentId}/${branch}/${scope}/${revision}`,
              ),
              operation: AnalyticsPath.fromString(
                `operation/${operation.type}/${operation.index}`,
              ),
              target: AnalyticsPath.fromString(`target/${target}`),
              actionType: AnalyticsPath.fromString(`actionType/${actionType}`),
            },
          };

          buffer.push(seriesInput);

          while (buffer.length >= CHUNK_SIZE) {
            const batch = buffer.splice(0, CHUNK_SIZE);
            await this.analyticsStore.addSeriesValues(batch);
          }
        }

        if (buffer.length > 0) {
          await this.analyticsStore.addSeriesValues(buffer);
        }
      }
    }
  }

  async onDisconnect() {}

  private getActionType(action: string): ActionType {
    if (CREATE_NODE_ACTIONS.includes(action)) {
      return "CREATE";
    }
    if (DELETE_NODE_ACTIONS.includes(action)) {
      return "DELETE";
    }
    return "UPDATE";
  }

  private async clearSource(source: AnalyticsPath) {
    try {
      await this.analyticsStore.clearSeriesBySource(source, true);
    } catch (e) {
      this.logger.error("Failed to clear source", e);
    }
  }
}
