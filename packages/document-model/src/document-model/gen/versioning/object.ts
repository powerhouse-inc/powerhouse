import { BaseDocumentClass } from "../../../document/object.js";
import { ReducerOptions } from "../../../document/types.js";
import { DocumentModelPHState } from "../ph-factories.js";
import {
  AddChangeLogItemInput,
  DeleteChangeLogItemInput,
  ReorderChangeLogItemsInput,
  UpdateChangeLogItemInput,
} from "../schema/types.js";
import {
  addChangeLogItem,
  deleteChangeLogItem,
  releaseNewVersion,
  reorderChangeLogItems,
  updateChangeLogItem,
} from "./creators.js";

export default class DocumentModel_Versioning extends BaseDocumentClass<DocumentModelPHState> {
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
