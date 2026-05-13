import { ANALYTICS_ENGINE_CORE_PACKAGE } from "@powerhousedao/shared/clis";
import { ts } from "@tmpl/core";

export const analyticsProcessorTemplate = (v: { pascalCaseName: string }) =>
  ts`
import type { AnalyticsSeriesInput, AnalyticsPath, IAnalyticsStore } from "${ANALYTICS_ENGINE_CORE_PACKAGE}";
import type { OperationWithContext, IProcessor } from "@powerhousedao/reactor-browser";

export class ${v.pascalCaseName} implements IProcessor {
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
