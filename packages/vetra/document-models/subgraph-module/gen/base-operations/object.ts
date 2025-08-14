import { BaseDocumentClass } from "document-model";
import {
  type SetSubgraphNameInput,
  type SubgraphModuleState,
  type SubgraphModuleLocalState,
} from "../types.js";
import { setSubgraphName } from "./creators.js";
import { type SubgraphModuleAction } from "../actions.js";

export default class SubgraphModule_BaseOperations extends BaseDocumentClass<
  SubgraphModuleState,
  SubgraphModuleLocalState,
  SubgraphModuleAction
> {
  public setSubgraphName(input: SetSubgraphNameInput) {
    return this.dispatch(setSubgraphName(input));
  }
}
