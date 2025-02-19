import { ProcessorOptions, ProcessorSetupArgs } from "#types.js";
import { IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import { OperationScope, PHDocument } from "document-model";
import { Processor } from "./processor.js";

export * from "@powerhousedao/analytics-engine-core";

export abstract class AnalyticsProcessor<
  D extends PHDocument = PHDocument,
  S extends OperationScope = OperationScope,
> extends Processor<D, S> {
  protected analyticsStore: IAnalyticsStore;

  constructor(args: ProcessorSetupArgs, options?: ProcessorOptions) {
    super(args, options);
    this.analyticsStore = args.analyticsStore;
  }
}
