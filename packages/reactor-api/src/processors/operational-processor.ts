import { Db, ProcessorOptions, ProcessorSetupArgs } from "#types.js";
import { OperationScope, PHDocument } from "document-model";
import { Processor } from "./processor.js";

export abstract class OperationalProcessor<
  D extends PHDocument = PHDocument,
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
