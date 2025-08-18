import { BaseDocumentClass } from "document-model";
import {
  type SetSubgraphNameInput,
  type SetSubgraphStatusInput,
  type SubgraphModuleState,
  type SubgraphModuleLocalState,
} from "../types.js";
import { setSubgraphName, setSubgraphStatus } from "./creators.js";
import { type SubgraphModuleAction } from "../actions.js";

export default class SubgraphModule_BaseOperations extends BaseDocumentClass<
  SubgraphModuleState,
  SubgraphModuleLocalState,
  SubgraphModuleAction
> {
  public setSubgraphName(input: SetSubgraphNameInput) {
    return this.dispatch(setSubgraphName(input));
  }

  public setSubgraphStatus(input: SetSubgraphStatusInput) {
    return this.dispatch(setSubgraphStatus(input));
  }
}
