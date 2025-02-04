import { BaseDocument } from "document-model/document";
import {
  AddFileInput,
  AddFolderInput,
  DeleteNodeInput,
  UpdateFileInput,
  UpdateNodeInput,
  CopyNodeInput,
  MoveNodeInput,
  DocumentDriveState,
  DocumentDriveLocalState,
} from "../types";
import {
  addFile,
  addFolder,
  deleteNode,
  updateFile,
  updateNode,
  copyNode,
  moveNode,
} from "./creators";
import { DocumentDriveAction } from "../actions";

export default class DocumentDrive_Node extends BaseDocument<
  DocumentDriveState,
  DocumentDriveAction,
  DocumentDriveLocalState
> {
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
