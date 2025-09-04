import type { BaseStateFromDocument, SignalDispatch } from "document-model";
import { applyMixins, BaseDocumentClass } from "document-model";
import type { SubgraphModuleAction } from "./actions.js";
import SubgraphModule_BaseOperations from "./base-operations/object.js";
import { reducer } from "./reducer.js";
import type {
  SubgraphModuleDocument,
  SubgraphModuleLocalState,
  SubgraphModuleState,
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
}

applyMixins(SubgraphModule, [SubgraphModule_BaseOperations]);

export { SubgraphModule };
