import { IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import { Document, OperationScope } from "document-model/document";
import { Processor } from "./processor";
import { ProcessorOptions, ProcessorSetupArgs } from "../types";

export * from "@powerhousedao/analytics-engine-core";

export abstract class AnalyticsProcessor<
  D extends Document = Document,
  S extends OperationScope = OperationScope,
> extends Processor<D, S> {
  protected analyticsStore: IAnalyticsStore;

  constructor(args: ProcessorSetupArgs, options?: ProcessorOptions) {
    super(args, options);
    this.analyticsStore = args.analyticsStore;
  }
}
