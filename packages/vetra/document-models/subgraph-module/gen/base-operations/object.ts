import { BaseDocumentClass } from "document-model";
import { SubgraphModulePHState } from "../ph-factories.js";
import {
  type SetSubgraphNameInput,
  type SetSubgraphStatusInput,
} from "../types.js";
import { setSubgraphName, setSubgraphStatus } from "./creators.js";
import { type SubgraphModuleAction } from "../actions.js";

export default class SubgraphModule_BaseOperations extends BaseDocumentClass<SubgraphModulePHState> {
  public setSubgraphName(input: SetSubgraphNameInput) {
    return this.dispatch(setSubgraphName(input));
  }

  public setSubgraphStatus(input: SetSubgraphStatusInput) {
    return this.dispatch(setSubgraphStatus(input));
  }
}
