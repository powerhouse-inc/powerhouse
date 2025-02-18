import { Document, OperationScope } from "document-model";
import { Db, ProcessorOptions, ProcessorSetupArgs } from "src/types";
import { Processor } from "./processor";

export abstract class OperationalProcessor<
  D extends Document = Document,
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
