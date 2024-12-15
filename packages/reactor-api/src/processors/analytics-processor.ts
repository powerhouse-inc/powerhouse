import { IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import { Document, OperationScope } from "document-model/document";
import { Processor } from "./processor";
import { ProcessorOptions, ProcessorSetupArgs } from "src/types";
import { KnexQueryExecutor } from "@powerhousedao/analytics-engine-knex";
import { KnexAnalyticsStore } from "@powerhousedao/analytics-engine-knex";

export * from "@powerhousedao/analytics-engine-core";

export abstract class AnalyticsProcessor<
  D extends Document = Document,
  S extends OperationScope = OperationScope,
> extends Processor<D, S> {
  protected analyticsStore: IAnalyticsStore;

  constructor(args: ProcessorSetupArgs, options?: ProcessorOptions) {
    super(args, options);
    this.analyticsStore = new KnexAnalyticsStore({
      executor: new KnexQueryExecutor(),
      knex: args.operationalStore,
    });
  }
}
