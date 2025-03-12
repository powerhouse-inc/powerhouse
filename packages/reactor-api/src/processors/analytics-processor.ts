import { ProcessorOptions, ProcessorSetupArgs } from "#types.js";
import { IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import { Processor } from "./processor.js";

export * from "@powerhousedao/analytics-engine-core";

export abstract class AnalyticsProcessor extends Processor {
  protected analyticsStore: IAnalyticsStore;

  constructor(args: ProcessorSetupArgs, options?: ProcessorOptions) {
    super(args, options);
    this.analyticsStore = args.analyticsStore;
  }
}
