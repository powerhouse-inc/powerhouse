import { IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import { IBaseDocumentDriveServer } from "document-drive";
import { Document, OperationScope } from "document-model/document";
import { Processor } from "./processor";
import { AnalyticsProcessorSetupArgs } from "src/types";

export abstract class AnalyticsProcessor<
  D extends Document = Document,
  S extends OperationScope = OperationScope,
> extends Processor<D, S> {
  constructor(
    protected reactor: IBaseDocumentDriveServer,
    protected analyticsStore: IAnalyticsStore,
  ) {
    super(reactor);
  }

  onSetup(args: AnalyticsProcessorSetupArgs) {
    super.onSetup(args);
    this.analyticsStore = args.analyticsStore;
  }
}
