import { ts } from "@tmpl/core";
const analyticsPathFromString =
  "`/${this.NAMESPACE}/${strand.driveId}/${strand.documentId}/${strand.branch}/${strand.scope}`";
export const analyticsIndexTemplate = (v: { pascalCaseName: string }) =>
  ts`
import type { AnalyticsSeriesInput, IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import { AnalyticsPath } from "@powerhousedao/analytics-engine-core";
import type { OperationWithContext, IProcessor } from "@powerhousedao/reactor";

export class ${v.pascalCaseName}Processor implements IProcessor {
  private readonly NAMESPACE = "${v.pascalCaseName}";

  private readonly inputs: AnalyticsSeriesInput[] = [];

  constructor(private readonly analyticsStore: IAnalyticsStore) {
    //
  }

  onOperations(operations: OperationWithContext[]): Promise<void> {
    return Promise.resolve();
  }

  onDisconnect(): Promise<void> {
    return Promise.resolve();
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
