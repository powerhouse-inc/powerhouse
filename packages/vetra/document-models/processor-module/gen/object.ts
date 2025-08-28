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
    initialState?: Partial<BaseStateFromDocument<ProcessorModuleDocument>>,
    dispatch?: SignalDispatch,
  ) {
    super(reducer, utils.createDocument(initialState), dispatch);
  }

  public saveToFile(path: string, name?: string) {
    return super.saveToFile(path, ProcessorModule.fileExtension, name);
  }

  public loadFromFile(path: string) {
    return super.loadFromFile(path);
  }

  static async fromFile(path: string) {
    const document = new this();
    await document.loadFromFile(path);
    return document;
  }
}

applyMixins(ProcessorModule, [ProcessorModule_BaseOperations]);

export { ProcessorModule };
