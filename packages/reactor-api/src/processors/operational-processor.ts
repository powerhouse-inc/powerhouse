import { IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import { Document, OperationScope } from "document-model/document";
import { Processor } from "./processor";
import { ProcessorOptions, ProcessorSetupArgs } from "src/types";
import { Knex } from "knex";

export abstract class OperationalProcessor<
  D extends Document = Document,
  S extends OperationScope = OperationScope,
> extends Processor<D, S> {
  protected operationalStore: Knex;

  constructor(args: ProcessorSetupArgs, options?: ProcessorOptions) {
    super(args, options);
    this.operationalStore = args.operationalStore;
  }

  onSetup(args: ProcessorSetupArgs) {
    super.onSetup(args);
    this.operationalStore = args.operationalStore;
  }
}
