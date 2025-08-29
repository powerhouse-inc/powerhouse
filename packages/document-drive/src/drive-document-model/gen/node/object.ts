import type {
  AddFileInput,
  AddFolderInput,
  CopyNodeInput,
  DeleteNodeInput,
  DocumentDriveAction,
  MoveNodeInput,
  UpdateFileInput,
  UpdateNodeInput,
} from "document-drive";
import {
  addFile,
  addFolder,
  copyNode,
  deleteNode,
  moveNode,
  updateFile,
  updateNode,
} from "document-drive";
import type {
  AbstractConstructor,
  AugmentConstructor,
  BaseDocumentClass,
} from "document-model";

export interface DocumentDrive_Node_Augment<
  TAction extends DocumentDriveAction,
> {
  addFile(input: AddFileInput): this;
  addFolder(input: AddFolderInput): this;
  deleteNode(input: DeleteNodeInput): this;
  updateFile(input: UpdateFileInput): this;
  updateNode(input: UpdateNodeInput): this;
  copyNode(input: CopyNodeInput): this;
  moveNode(input: MoveNodeInput): this;
}

export function DocumentDrive_Node<
  TGlobalState,
  TLocalState,
  TAction extends DocumentDriveAction,
  TBase extends AbstractConstructor<
    BaseDocumentClass<TGlobalState, TLocalState, TAction>
  >,
>(Base: TBase): AugmentConstructor<TBase, DocumentDrive_Node_Augment<TAction>> {
  abstract class DocumentDrive_NodeClass extends Base {
    public addFile(input: AddFileInput) {
      return this.dispatch(addFile(input) as TAction);
    }
    public addFolder(input: AddFolderInput) {
      return this.dispatch(addFolder(input) as TAction);
    }
    public deleteNode(input: DeleteNodeInput) {
      return this.dispatch(deleteNode(input) as TAction);
    }
    public updateFile(input: UpdateFileInput) {
      return this.dispatch(updateFile(input) as TAction);
    }
    public updateNode(input: UpdateNodeInput) {
      return this.dispatch(updateNode(input) as TAction);
    }
    public copyNode(input: CopyNodeInput) {
      return this.dispatch(copyNode(input) as TAction);
    }
    public moveNode(input: MoveNodeInput) {
      return this.dispatch(moveNode(input) as TAction);
    }
  }
  return DocumentDrive_NodeClass as unknown as AugmentConstructor<
    TBase,
    DocumentDrive_Node_Augment<TAction>
  >;
}
