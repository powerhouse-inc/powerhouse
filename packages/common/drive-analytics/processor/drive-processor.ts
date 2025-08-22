import {
  AnalyticsPath,
  DateTime,
  type AnalyticsSeriesInput,
  type IAnalyticsStore,
} from "@powerhousedao/reactor-browser/analytics";
import { childLogger } from "document-drive";
import { type IProcessor } from "document-drive/processors/types";
import { type InternalTransmitterUpdate } from "document-drive/server/listener/transmitter/internal";

const CREATE_NODE_ACTIONS = ["ADD_FILE", "ADD_FOLDER"];
const DUPLICATE_NODE_ACTIONS = ["COPY_NODE"];
const UPDATE_NODE_ACTIONS = ["UPDATE_FILE", "UPDATE_NODE"];
const MOVE_NODE_ACTIONS = ["MOVE_NODE"];
const REMOVE_NODE_ACTIONS = ["DELETE_NODE"];

const NODE_ACTIONS = [
  ...CREATE_NODE_ACTIONS,
  ...DUPLICATE_NODE_ACTIONS,
  ...UPDATE_NODE_ACTIONS,
  ...MOVE_NODE_ACTIONS,
  ...REMOVE_NODE_ACTIONS,
];

export type Target = "DRIVE" | "NODE";
export type ActionType =
  | "CREATED"
  | "DUPLICATED"
  | "REMOVED"
  | "MOVED"
  | "UPDATED";
type NodeActionInput = { id?: string; targetId?: string; srcFolder?: string };

export class DriveAnalyticsProcessor implements IProcessor {
  constructor(
    private readonly analyticsStore: IAnalyticsStore,
    private readonly logger = childLogger(["processor", "drive-analytics"]),
  ) {
    //
  }

  async onStrands(strands: InternalTransmitterUpdate[]): Promise<void> {
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
        `ph/drive/${strand.documentId}/${strand.branch}/${strand.scope}`,
      );

      if (firstOp.index === 0) {
        await this.clearSource(source);
      }

      const { documentId: driveId, branch, scope } = strand;

      const CHUNK_SIZE = 50;
      for (let i = 0; i < strand.operations.length; i += CHUNK_SIZE) {
        const chunk = strand.operations.slice(i, i + CHUNK_SIZE);

        const buffer: AnalyticsSeriesInput[] = [];

        for (const operation of chunk) {
          const revision = operation.index;
          const actionType = this.getActionType(operation.action.type);
          const target: Target = NODE_ACTIONS.includes(operation.action.type)
            ? "NODE"
            : "DRIVE";

          let targetId = driveId;

          if (target === "NODE") {
            const operationInput = operation.action.input as NodeActionInput;
            targetId =
              operationInput.id ||
              operationInput.targetId ||
              operationInput.srcFolder ||
              driveId;
          }

          const seriesInput: AnalyticsSeriesInput = {
            source,
            metric: "DriveOperations",
            start: DateTime.fromISO(operation.timestampUtcMs),
            value: 1,
            dimensions: {
              drive: AnalyticsPath.fromString(
                `ph/drive/${driveId}/${branch}/${scope}/${revision}`,
              ),
              operation: AnalyticsPath.fromString(
                `ph/drive/operation/${operation.action.type}/${operation.index}`,
              ),
              target: AnalyticsPath.fromString(
                `ph/drive/target/${target}/${targetId}`,
              ),
              actionType: AnalyticsPath.fromString(
                `ph/drive/actionType/${actionType}/${targetId}`,
              ),
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
      return "CREATED";
    }
    if (DUPLICATE_NODE_ACTIONS.includes(action)) {
      return "DUPLICATED";
    }
    if (REMOVE_NODE_ACTIONS.includes(action)) {
      return "REMOVED";
    }
    if (MOVE_NODE_ACTIONS.includes(action)) {
      return "MOVED";
    }
    return "UPDATED";
  }

  private async clearSource(source: AnalyticsPath) {
    try {
      await this.analyticsStore.clearSeriesBySource(source, true);
    } catch (e) {
      this.logger.error("Failed to clear source", e);
    }
  }
}
