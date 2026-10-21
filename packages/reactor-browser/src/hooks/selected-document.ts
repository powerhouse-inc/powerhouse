import { ModuleNotFoundError } from "@powerhousedao/reactor";
import type { DocumentDispatch } from "@powerhousedao/reactor-browser";
import { isFileNode } from "@powerhousedao/shared/document-drive";
import type { Action, PHDocument } from "@powerhousedao/shared/document-model";
import {
  DocumentTypeMismatchError,
  NoSelectedDocumentError,
} from "../errors.js";
import type { DispatchFn, UseDispatchResult } from "./dispatch.js";
import { useDocumentById } from "./document-by-id.js";
import { useDocumentModelModuleById } from "./document-model-modules.js";
import { useDocumentOfType } from "./document-of-type.js";
import { useDriveContext } from "./drive-context.js";
import { useEditorDocumentContext } from "./editor-context.js";
import { useSelectedNode } from "./selected-node.js";

/** Returns the selected document id: the editor's document, else the drive
 * app's open document, else the app's selection. */
export function useSelectedDocumentId(): string | undefined {
  const editor = useEditorDocumentContext();
  const drive = useDriveContext();
  const selectedNode = useSelectedNode();
  if (editor) return editor[0].header.id;
  // The drive may not list a document the route opened yet.
  if (drive?.nodeId && !drive.folder) {
    return selectedNode && !isFileNode(selectedNode) ? undefined : drive.nodeId;
  }
  return selectedNode && isFileNode(selectedNode) ? selectedNode.id : undefined;
}

/** Returns the selected document. */
export function useSelectedDocument(): readonly [
  PHDocument,
  DispatchFn<Action>,
] {
  const [document, dispatch] = useSelectedDocumentSafe();
  if (!document) {
    throw new NoSelectedDocumentError();
  }
  return [document, dispatch] as const;
}

/** Returns the selected document: the editor's, else the app's selection. */
export function useSelectedDocumentSafe(): UseDispatchResult<
  PHDocument,
  Action
> {
  const editor = useEditorDocumentContext();
  const selectedDocumentId = useSelectedDocumentId();
  const selected = useDocumentById(editor ? null : selectedDocumentId);
  return editor ?? selected;
}

/** Returns the selected document of a specific type, throws an error if the found document has a different type */
export function useSelectedDocumentOfType(
  documentType: null | undefined,
): never[];
export function useSelectedDocumentOfType<
  TDocument extends PHDocument,
  TAction extends Action,
>(documentType: string): [TDocument, DocumentDispatch<TAction>];
export function useSelectedDocumentOfType<
  TDocument extends PHDocument,
  TAction extends Action,
>(
  documentType: string | null | undefined,
): never[] | [TDocument, DocumentDispatch<TAction>] {
  const editor = useEditorDocumentContext();
  const documentId = useSelectedDocumentId();
  // Called on every render; without a type, or in an editor, it reads no document.
  const result = useDocumentOfType<TDocument, TAction>(
    documentType && !editor ? documentId : null,
    documentType,
  );
  const documentModelModule = useDocumentModelModuleById(documentType);

  if (!documentType) {
    return [];
  }
  if (editor) {
    const [document, dispatch] = editor;
    if (!documentModelModule) {
      throw new ModuleNotFoundError(documentType);
    }
    if (document.header.documentType !== documentType) {
      throw new DocumentTypeMismatchError(
        document.header.id,
        documentType,
        document.header.documentType,
      );
    }
    return [document as TDocument, dispatch];
  }
  if (!documentId) {
    throw new NoSelectedDocumentError();
  }
  return result;
}
