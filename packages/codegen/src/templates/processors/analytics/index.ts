import { ts } from "@tmpl/core";
const analyticsPathFromString =
  "`/${this.NAMESPACE}/${strand.driveId}/${strand.documentId}/${strand.branch}/${strand.scope}`";
export const analyticsIndexTemplate = (v: { pascalCaseName: string }) =>
  ts`
import type { AnalyticsSeriesInput, IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import { AnalyticsPath } from "@powerhousedao/analytics-engine-core";
import type { InternalTransmitterUpdate, IProcessor } from "document-drive";

export class ${v.pascalCaseName}Processor implements IProcessor {
  private readonly NAMESPACE = "${v.pascalCaseName}";

  private readonly inputs: AnalyticsSeriesInput[] = [];

  constructor(private readonly analyticsStore: IAnalyticsStore) {
    //
  }

  async onStrands(strands: InternalTransmitterUpdate[]): Promise<void> {
    if (strands.length === 0) {
      return;
    }

    for (const strand of strands) {
      if (strand.operations.length === 0) {
        continue;
      }

      const source = AnalyticsPath.fromString(
        ${analyticsPathFromString},
      );

      // clear source if we have already inserted these analytics
      const firstOp = strand.operations[0];
      if (firstOp.index === 0) {
        await this.clearSource(source);
      }

      for (const operation of strand.operations) {
        // this.inputs.push( ... );
      }
    }

    // batch insert
    if (this.inputs.length > 0) {
      await this.analyticsStore.addSeriesValues(this.inputs);

      this.inputs.length = 0;
    }
  }

  async onDisconnect() {
    //
  }

  private async clearSource(source: AnalyticsPath) {
    try {
      await this.analyticsStore.clearSeriesBySource(source, true);
    } catch (e) {
      console.error(e);
    }
  }
}
`.raw;
