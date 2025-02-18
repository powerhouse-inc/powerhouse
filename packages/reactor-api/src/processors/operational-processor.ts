import { Db, ProcessorOptions, ProcessorSetupArgs } from "#types.js";
import { BaseDocument, OperationScope } from "document-model";
import { Processor } from "./processor.js";

export abstract class OperationalProcessor<
  D extends BaseDocument<unknown, unknown> = BaseDocument<unknown, unknown>,
  S extends OperationScope = OperationScope,
> extends Processor<D, S> {
  protected operationalStore: Db;

  constructor(args: ProcessorSetupArgs, options?: ProcessorOptions) {
    super(args, options);
    this.operationalStore = args.operationalStore;
  }

  onSetup(args: ProcessorSetupArgs) {
    super.onSetup(args);
    this.operationalStore = args.operationalStore;
  }
}
