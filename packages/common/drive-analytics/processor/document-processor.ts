import type {
  AnalyticsSeriesInput,
  IAnalyticsStore,
} from "@powerhousedao/analytics-engine-core";
import { AnalyticsPath } from "@powerhousedao/analytics-engine-core";
import type { InternalTransmitterUpdate, IProcessor } from "document-drive";
import { childLogger } from "document-drive";
import { DateTime } from "luxon";
export type NodeTarget = "DRIVE" | "NODE";

export class DocumentAnalyticsProcessor implements IProcessor {
  constructor(
    private readonly analyticsStore: IAnalyticsStore,
    private readonly logger = childLogger(["processor", "document-analytics"]),
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
        `ph/doc/${strand.driveId}/${strand.documentId}/${strand.branch}/${strand.scope}`,
      );

      if (firstOp.index === 0) {
        await this.clearSource(source);
      }

      const { driveId, documentId, branch, scope } = strand;

      const target: NodeTarget = driveId === documentId ? "DRIVE" : "NODE";

      const CHUNK_SIZE = 50;
      for (let i = 0; i < strand.operations.length; i += CHUNK_SIZE) {
        const chunk = strand.operations.slice(i, i + CHUNK_SIZE);

        const buffer: AnalyticsSeriesInput[] = [];

        for (const operation of chunk) {
          const revision = operation.index;

          const seriesInput: AnalyticsSeriesInput = {
            source,
            metric: "DocumentOperations",
            start: DateTime.fromISO(operation.timestampUtcMs),
            value: 1,
            dimensions: {
              drive: AnalyticsPath.fromString(
                `ph/doc/drive/${driveId}/${branch}/${scope}/${revision}`,
              ),
              operation: AnalyticsPath.fromString(
                `ph/doc/operation/${operation.action.type}/${operation.index}`,
              ),
              target: AnalyticsPath.fromString(
                `ph/doc/target/${driveId}/${target}/${documentId}`,
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

  private async clearSource(source: AnalyticsPath) {
    try {
      await this.analyticsStore.clearSeriesBySource(source, true);
    } catch (e) {
      this.logger.error("Failed to clear source", e);
    }
  }
}
