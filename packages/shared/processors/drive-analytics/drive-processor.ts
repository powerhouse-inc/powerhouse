import { DateTime } from "luxon";
import { AnalyticsPath } from "../../analytics/analytics-path.js";
import type {
  AnalyticsSeriesInput,
  IAnalyticsStore,
} from "../../analytics/types.js";
import type { OperationWithContext } from "../../document-model/index.js";
import type { IProcessor } from "../types.js";
import type { ActionType, NodeTarget } from "./types.js";

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

function getActionType(action: string): ActionType {
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

type NodeActionInput = { id?: string; targetId?: string; srcFolder?: string };

export class DriveAnalyticsProcessor implements IProcessor {
  constructor(private readonly analyticsStore: IAnalyticsStore) {
    //
  }

  async onOperations(operations: OperationWithContext[]): Promise<void> {
    if (operations.length === 0) {
      return;
    }

    const CHUNK_SIZE = 50;
    const buffer: AnalyticsSeriesInput[] = [];

    for (const { operation, context } of operations) {
      const { documentType, documentId, branch, scope } = context;
      if (documentType !== "powerhouse/document-drive") {
        continue;
      }

      const {
        action: { type, input, timestampUtcMs },
      } = operation;
      const source = AnalyticsPath.fromString(
        `ph/drive/${documentId}/${branch}/${scope}`,
      );

      const revision = operation.index;
      const actionType = getActionType(type);

      const target: NodeTarget = NODE_ACTIONS.includes(type) ? "NODE" : "DRIVE";

      let targetId = documentId;
      if (target === "NODE") {
        const operationInput = input as NodeActionInput;
        targetId =
          operationInput.id ||
          operationInput.targetId ||
          operationInput.srcFolder ||
          documentId;
      }

      const seriesInput: AnalyticsSeriesInput = {
        source,
        metric: "DriveOperations",
        start: DateTime.fromISO(timestampUtcMs),
        value: 1,
        dimensions: {
          drive: AnalyticsPath.fromString(
            `ph/drive/${documentId}/${branch}/${scope}/${revision}`,
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

  async onDisconnect() {}
}
