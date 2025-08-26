import {
  BaseDocumentClass,
  applyMixins,
  type SignalDispatch,
} from "document-model";
import { SubgraphModulePHState } from "./ph-factories.js";
import { type SubgraphModuleAction } from "./actions.js";
import { reducer } from "./reducer.js";
import { createDocument } from "./utils.js";
import SubgraphModule_BaseOperations from "./base-operations/object.js";

export * from "./base-operations/object.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
interface SubgraphModule extends SubgraphModule_BaseOperations {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class SubgraphModule extends BaseDocumentClass<SubgraphModulePHState> {
  static fileExtension = ".phdm";

  constructor(
    initialState?: Partial<SubgraphModulePHState>,
    dispatch?: SignalDispatch,
  ) {
    super(reducer, createDocument(initialState), dispatch);
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
