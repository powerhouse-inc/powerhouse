import type {
  AbstractConstructor,
  Action,
  AddChangeLogItemInput,
  AugmentConstructor,
  BaseDocumentClass,
  DeleteChangeLogItemInput,
  ReducerOptions,
  ReorderChangeLogItemsInput,
  UpdateChangeLogItemInput,
} from "document-model";
import {
  addChangeLogItem,
  deleteChangeLogItem,
  releaseNewVersion,
  reorderChangeLogItems,
  updateChangeLogItem,
} from "document-model";

export interface DocumentModel_Versioning_Augment<TAction extends Action> {
  addChangeLogItem(
    input: AddChangeLogItemInput,
    options?: ReducerOptions,
  ): this;
  updateChangeLogItem(
    input: UpdateChangeLogItemInput,
    options?: ReducerOptions,
  ): this;
  deleteChangeLogItem(
    input: DeleteChangeLogItemInput,
    options?: ReducerOptions,
  ): this;
  reorderChangeLogItems(
    input: ReorderChangeLogItemsInput,
    options?: ReducerOptions,
  ): this;
  releaseNewVersion(options?: ReducerOptions): this;
}

export function DocumentModel_Versioning<
  TGlobalState,
  TLocalState,
  TAction extends Action,
  TBase extends AbstractConstructor<
    BaseDocumentClass<TGlobalState, TLocalState, TAction>
  >,
>(
  Base: TBase,
): AugmentConstructor<TBase, DocumentModel_Versioning_Augment<TAction>> {
  abstract class DocumentModel_VersioningClass extends Base {
    public addChangeLogItem(
      input: AddChangeLogItemInput,
      options?: ReducerOptions,
    ) {
      return this.dispatch(addChangeLogItem(input) as TAction, options);
    }
    public updateChangeLogItem(
      input: UpdateChangeLogItemInput,
      options?: ReducerOptions,
    ) {
      return this.dispatch(updateChangeLogItem(input) as TAction, options);
    }
    public deleteChangeLogItem(
      input: DeleteChangeLogItemInput,
      options?: ReducerOptions,
    ) {
      return this.dispatch(deleteChangeLogItem(input) as TAction, options);
    }
    public reorderChangeLogItems(
      input: ReorderChangeLogItemsInput,
      options?: ReducerOptions,
    ) {
      return this.dispatch(reorderChangeLogItems(input) as TAction, options);
    }
    public releaseNewVersion(options?: ReducerOptions) {
      return this.dispatch(releaseNewVersion() as TAction, options);
    }
  }
  return DocumentModel_VersioningClass as unknown as AugmentConstructor<
    TBase,
    DocumentModel_Versioning_Augment<TAction>
  >;
}
