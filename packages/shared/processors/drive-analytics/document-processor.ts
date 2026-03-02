import type {
  AnalyticsSeriesInput,
  IAnalyticsStore,
} from "@powerhousedao/analytics-engine-core";
import { AnalyticsPath } from "@powerhousedao/analytics-engine-core";
import { DateTime } from "luxon";
import type { OperationWithContext } from "../../document-model/index.js";
import type { IProcessor } from "../types.js";
import type { NodeTarget } from "./types.js";

export class DocumentAnalyticsProcessor implements IProcessor {
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

      const source = AnalyticsPath.fromString(
        `ph/doc/${documentId}/${branch}/${scope}`,
      );

      const target: NodeTarget =
        documentType === "powerhouse/document-drive" ? "DRIVE" : "NODE";

      const revision = operation.index;

      const seriesInput: AnalyticsSeriesInput = {
        source,
        metric: "DocumentOperations",
        start: DateTime.fromISO(operation.timestampUtcMs),
        value: 1,
        dimensions: {
          drive: AnalyticsPath.fromString(
            `ph/doc/drive/${documentId}/${branch}/${scope}/${revision}`,
          ),
          operation: AnalyticsPath.fromString(
            `ph/doc/operation/${operation.action.type}/${operation.index}`,
          ),
          target: AnalyticsPath.fromString(
            `ph/doc/target/${target}/${documentId}`,
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
