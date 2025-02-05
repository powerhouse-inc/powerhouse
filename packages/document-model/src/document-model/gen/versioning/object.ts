import { BaseDocument } from "@document/object.js";

import {
  DocumentModelState,
  DocumentModelLocalState,
} from "../types.js";
import {
  addChangeLogItem,
  updateChangeLogItem,
  deleteChangeLogItem,
  reorderChangeLogItems,
  releaseNewVersion
} from "./creators.js";
import { DocumentModelAction } from "../actions.js";
import { ReducerOptions } from "@document/types.js";
import { AddChangeLogItemInput, UpdateChangeLogItemInput, DeleteChangeLogItemInput, ReorderChangeLogItemsInput } from "../schema/types.js";

export default class DocumentModel_Versioning extends BaseDocument<
  DocumentModelState,
  DocumentModelAction,
  DocumentModelLocalState
> {
  public addChangeLogItem(
    input: AddChangeLogItemInput,
    options?: ReducerOptions,
  ) {
    return this.dispatch(addChangeLogItem(input), options);
  }

  public updateChangeLogItem(
    input: UpdateChangeLogItemInput,
    options?: ReducerOptions,
  ) {
    return this.dispatch(updateChangeLogItem(input), options);
  }

  public deleteChangeLogItem(
    input: DeleteChangeLogItemInput,
    options?: ReducerOptions,
  ) {
    return this.dispatch(deleteChangeLogItem(input), options);
  }

  public reorderChangeLogItems(
    input: ReorderChangeLogItemsInput,
    options?: ReducerOptions,
  ) {
    return this.dispatch(reorderChangeLogItems(input), options);
  }

  public releaseNewVersion(options?: ReducerOptions) {
    return this.dispatch(releaseNewVersion(), options);
  }
}
