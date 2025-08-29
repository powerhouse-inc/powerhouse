import type {
  AddChangeLogItemInput,
  DeleteChangeLogItemInput,
  DocumentModelAction,
  DocumentModelLocalState,
  DocumentModelState,
  ReducerOptions,
  ReorderChangeLogItemsInput,
  UpdateChangeLogItemInput,
} from "document-model";
import { BaseDocumentClass } from "document-model";
import {
  addChangeLogItem,
  deleteChangeLogItem,
  releaseNewVersion,
  reorderChangeLogItems,
  updateChangeLogItem,
} from "document-model";

export class DocumentModel_Versioning extends BaseDocumentClass<
  DocumentModelState,
  DocumentModelLocalState,
  DocumentModelAction
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
