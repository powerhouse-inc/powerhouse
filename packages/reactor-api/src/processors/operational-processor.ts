import { Db, ProcessorOptions, ProcessorSetupArgs } from "#types.js";
import { Processor } from "./processor.js";

export abstract class OperationalProcessor extends Processor {
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
