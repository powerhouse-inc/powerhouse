import { BaseDocumentClass } from "document-model";
import {
  type AddFileInput,
  type AddFolderInput,
  type DeleteNodeInput,
  type UpdateFileInput,
  type UpdateNodeInput,
  type CopyNodeInput,
  type MoveNodeInput,
  type DocumentDriveState,
  type DocumentDriveLocalState,
} from "../types.js";
import {
  addFile,
  addFolder,
  deleteNode,
  updateFile,
  updateNode,
  copyNode,
  moveNode,
} from "./creators.js";
import { type DocumentDriveAction } from "../actions.js";
import { DocumentDrivePHState } from "../ph-factories.js";

export default class DocumentDrive_Node extends BaseDocumentClass<DocumentDrivePHState> {
  public addFile(input: AddFileInput) {
    return this.dispatch(addFile(input));
  }

  public addFolder(input: AddFolderInput) {
    return this.dispatch(addFolder(input));
  }

  public deleteNode(input: DeleteNodeInput) {
    return this.dispatch(deleteNode(input));
  }

  public updateFile(input: UpdateFileInput) {
    return this.dispatch(updateFile(input));
  }

  public updateNode(input: UpdateNodeInput) {
    return this.dispatch(updateNode(input));
  }

  public copyNode(input: CopyNodeInput) {
    return this.dispatch(copyNode(input));
  }

  public moveNode(input: MoveNodeInput) {
    return this.dispatch(moveNode(input));
  }
}
