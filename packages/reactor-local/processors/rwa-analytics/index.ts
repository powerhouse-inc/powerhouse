import { generateId } from "document-model/utils";
import {
  AnalyticsProcessor,
  ProcessorOptions,
  ProcessorUpdate,
  AnalyticsPath,
} from "@powerhousedao/reactor-api";
import {
  CreateGroupTransactionInput,
  RealWorldAssetsDocument,
} from "document-model-libs/real-world-assets";
import { DateTime } from "luxon";
type DocumentType = RealWorldAssetsDocument;

export class RwaAnalyticsProcessor extends AnalyticsProcessor<DocumentType> {
  protected processorOptions: ProcessorOptions = {
    listenerId: generateId(),
    filter: {
      branch: ["main"],
      documentId: ["*"],
      documentType: ["makerdao/rwa-portfolio"],
      scope: ["global"],
    },
    block: false,
    label: "rwa-analytics",
    system: true,
  };

  async onStrands(strands: ProcessorUpdate<DocumentType>[]): Promise<void> {
    if (strands.length === 0) {
      return;
    }

    for (const strand of strands) {
      if (strand.operations.length === 0) {
        continue;
      }

      const documentId = strand.documentId.replace("/", "-");

      const firstOp = strand.operations[0];
      const source = AnalyticsPath.fromString(
        `ph/${strand.driveId}/${documentId}/${strand.branch}/${strand.scope}`,
      );
      if (firstOp.index === 0) {
        await this.clearSource(source);
      }
      try {
        for (const operation of strand.operations) {
          console.log(">>> ", operation.type);

          if (operation.type === "CREATE_GROUP_TRANSACTION") {
            const groupTransaction =
              operation.input as CreateGroupTransactionInput;
            if (
              groupTransaction.type !== "AssetPurchase" &&
              groupTransaction.type !== "AssetSale" &&
              groupTransaction.type !== "PrincipalDraw" &&
              groupTransaction.type !== "PrincipalReturn"
            ) {
              continue;
            }

            const { fixedIncomeTransaction, cashTransaction } =
              groupTransaction;
            if (fixedIncomeTransaction) {
              const dimensions = {
                asset: AnalyticsPath.fromString(
                  `sky/rwas/assets/t-bills/${fixedIncomeTransaction.assetId}`,
                ),
                portfolio: AnalyticsPath.fromString(
                  `sky/rwas/portfolios/${documentId}`,
                ),
              };

              const args = {
                dimensions,
                metric: "AssetBalance",
                source,
                start: DateTime.fromISO(fixedIncomeTransaction.entryTime),
                value:
                  groupTransaction.type === "AssetPurchase"
                    ? fixedIncomeTransaction.amount
                    : -fixedIncomeTransaction.amount,
              };

              console.log(">>> ", JSON.stringify(args, null, 4));

              await this.analyticsStore.addSeriesValue(args);
            }

            if (cashTransaction) {
              const dimensions = {
                asset: AnalyticsPath.fromString(`sky/rwas/assets/cash`),
                portfolio: AnalyticsPath.fromString(
                  `sky/rwas/portfolios/${documentId}`,
                ),
              };

              const args = {
                dimensions,
                metric: "AssetBalance",
                source,
                start: DateTime.fromISO(cashTransaction.entryTime),
                value:
                  groupTransaction.type === "AssetPurchase" ||
                  groupTransaction.type === "PrincipalReturn"
                    ? -cashTransaction.amount
                    : cashTransaction.amount,
              };

              console.log(">>> ", JSON.stringify(args, null, 4));
              try {
                await this.analyticsStore.addSeriesValue(args);
              } catch (e) {
                console.error(e);
              }
            }
          }
        }
      } catch (e) {
        console.error(e);
      }
    }
  }

  async onDisconnect() {}

  private async clearSource(source: AnalyticsPath) {
    try {
      await this.analyticsStore.clearSeriesBySource(source, true);
    } catch (e) {
      console.error(e);
    }
  }
}
