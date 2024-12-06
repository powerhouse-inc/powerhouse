import { RealWorldAssetsDocument } from "document-model-libs/real-world-assets";
import { AnalyticsProcessor } from "./analytics-processor";
import { ProcessorUpdate } from "./processor";
import { AnalyticsProcessorSetupArgs } from "src/types";

export class RWAAnalyticsProcessor extends AnalyticsProcessor<
  RealWorldAssetsDocument,
  "global"
> {
  async onStrands(
    strands: ProcessorUpdate<RealWorldAssetsDocument, "global">[],
  ): Promise<void> {
    const firstOp = strands[0]?.operations[0];

    console.log(firstOp);
    // this.analyticsStore.addSeriesValue....
  }

  async onDisconnect() {
    return Promise.resolve();
  }

  onSetup(args: AnalyticsProcessorSetupArgs) {
    this.processorOptions = {
      listenerId: "rwa-analytics-processor",
      filter: {
        branch: ["main"],
        documentId: ["*"],
        documentType: ["*"],
        scope: ["global"],
      },
      block: false,
      label: "rwa-analytics-processor",
      system: true,
    };
    super.onSetup(args);
  }
}
