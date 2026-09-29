import { ANALYTICS_ENGINE_CORE_PACKAGE } from "@powerhousedao/shared/clis";
import { ts } from "@tmpl/core";

export const analyticsProcessorTemplate = (v: { pascalCaseName: string }) =>
  ts`
import { AnalyticsPath, type AnalyticsSeriesInput, type IAnalyticsStore } from "${ANALYTICS_ENGINE_CORE_PACKAGE}";
import type { OperationWithContext, IProcessor } from "@powerhousedao/reactor-browser";

export class ${v.pascalCaseName} implements IProcessor {
  private readonly NAMESPACE = "${v.pascalCaseName}";

  private readonly inputs: AnalyticsSeriesInput[] = [];

  constructor(private readonly analyticsStore: IAnalyticsStore) {
    //
  }

  async onOperations(operations: OperationWithContext[]): Promise<void> {
    for (const { operation, context } of operations) {
      // DELETE_DOCUMENT and PURGE_DOCUMENT alike: clear the document's series.
      if (
        operation.action.type === "DELETE_DOCUMENT" ||
        operation.action.type === "PURGE_DOCUMENT"
      ) {
        const input = operation.action.input as { documentId?: string };
        const documentId = input.documentId ?? context.documentId;
        await this.clearSource(AnalyticsPath.fromString(\`ph/doc/\${documentId}\`));
        continue;
      }
      // Record series under ph/doc/<documentId>/... so a deletion clears them.
    }
  }

  onDisconnect(): Promise<void> {
    return Promise.resolve();
  }

  private async clearSource(source: AnalyticsPath) {
    await this.analyticsStore.clearSeriesBySource(source, true);
  }
}
`.raw;
