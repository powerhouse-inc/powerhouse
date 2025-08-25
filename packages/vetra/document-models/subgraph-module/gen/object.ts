import {
  applyMixins,
  BaseDocumentClass,
  type BaseStateFromDocument,
  type SignalDispatch,
} from "document-model";
import { type SubgraphModuleAction } from "./actions.js";
import SubgraphModule_BaseOperations from "./base-operations/object.js";
import { reducer } from "./reducer.js";
import {
  type SubgraphModuleDocument,
  type SubgraphModuleLocalState,
  type SubgraphModuleState,
} from "./types.js";
import utils from "./utils.js";

export * from "./base-operations/object.js";

interface SubgraphModule extends SubgraphModule_BaseOperations {}

class SubgraphModule extends BaseDocumentClass<
  SubgraphModuleState,
  SubgraphModuleLocalState,
  SubgraphModuleAction
> {
  static fileExtension = ".phdm";

  constructor(
    initialState?: Partial<BaseStateFromDocument<SubgraphModuleDocument>>,
    dispatch?: SignalDispatch,
  ) {
    super(reducer, utils.createDocument(initialState), dispatch);
  }

  public saveToFile(path: string, name?: string) {
    return super.saveToFile(path, SubgraphModule.fileExtension, name);
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

applyMixins(SubgraphModule, [SubgraphModule_BaseOperations]);

export { SubgraphModule };
