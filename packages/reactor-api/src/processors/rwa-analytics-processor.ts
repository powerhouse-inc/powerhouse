import { RealWorldAssetsDocument } from "document-model-libs/real-world-assets";
import { AnalyticsProcessor } from "./analytics-processor";
import { ProcessorUpdate } from "./processor";

export class RWAAnalyticsProcessor extends AnalyticsProcessor<
  RealWorldAssetsDocument,
  "global"
> {
  processorOptions = {
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
  async onStrands(
    strands: ProcessorUpdate<RealWorldAssetsDocument, "global">[],
  ): Promise<void> {}

  async onDisconnect() {
    return Promise.resolve();
  }
}
