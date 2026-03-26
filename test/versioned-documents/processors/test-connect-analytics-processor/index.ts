import type {
  AnalyticsPath,
  AnalyticsSeriesInput,
  IAnalyticsStore,
} from "@powerhousedao/analytics-engine-core";
import type {
  IProcessor,
  OperationWithContext,
} from "@powerhousedao/reactor-browser";

export class TestConnectAnalyticsProcessorProcessor implements IProcessor {
  private readonly NAMESPACE = "TestConnectAnalyticsProcessor";

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
