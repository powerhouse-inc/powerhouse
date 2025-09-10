import type { BaseStateFromDocument, SignalDispatch } from "document-model";
import { applyMixins, BaseDocumentClass } from "document-model";
import type { ProcessorModuleAction } from "./actions.js";
import ProcessorModule_BaseOperations from "./base-operations/object.js";
import { reducer } from "./reducer.js";
import type {
  ProcessorModuleDocument,
  ProcessorModuleLocalState,
  ProcessorModuleState,
} from "./types.js";
import utils from "./utils.js";

export * from "./base-operations/object.js";

interface ProcessorModule extends ProcessorModule_BaseOperations {}

class ProcessorModule extends BaseDocumentClass<
  ProcessorModuleState,
  ProcessorModuleLocalState,
  ProcessorModuleAction
> {
  static fileExtension = ".phdm";

  constructor(
    initialState?: Partial<ProcessorModulePHState>,
    dispatch?: SignalDispatch,
  ) {
    super(reducer, createDocument(initialState), dispatch);
  }
}

applyMixins(ProcessorModule, [ProcessorModule_BaseOperations]);

export { ProcessorModule };
