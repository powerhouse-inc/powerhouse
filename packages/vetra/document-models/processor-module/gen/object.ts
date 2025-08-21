import {
  BaseDocumentClass,
  type BaseStateFromDocument,
  type PartialState,
  applyMixins,
  type SignalDispatch,
} from "document-model";
import {
  type ProcessorModuleState,
  type ProcessorModuleLocalState,
  type ProcessorModuleDocument,
} from "./types.js";
import { type ProcessorModuleAction } from "./actions.js";
import { reducer } from "./reducer.js";
import utils from "./utils.js";
import ProcessorModule_BaseOperations from "./base-operations/object.js";

export * from "./base-operations/object.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
interface ProcessorModule extends ProcessorModule_BaseOperations {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
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
