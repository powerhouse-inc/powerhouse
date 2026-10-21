import {
  DriveProvider,
  EditorDocumentProvider,
  useAppModuleById,
  useDispatch,
  useDocument,
  useEditorModuleFor,
  useRevisionHistoryVisible,
} from "@powerhousedao/reactor-browser";
import type { PHDocument } from "@powerhousedao/shared/document-model";
import { Outlet } from "@tanstack/react-router";
import { useMemo } from "react";
import { useDriveRouteData } from "../router/route-data.js";
import { DirectoryListing } from "./directory-listing.js";
import { DocumentHistory } from "./document-history.js";
import { DocumentJson } from "./document-json.js";
import { EditorHost } from "./editor-host.js";

/** `document`: its revision history while `?history` is set, else its
 * editor (given `document` and `dispatch`), else its JSON. */
export function DocumentView({ document }: { document: PHDocument }) {
  const [, dispatch] = useDispatch(document);
  const editor = useEditorModuleFor(document);
  const historyVisible = useRevisionHistoryVisible();
  if (historyVisible) return <DocumentHistory document={document} />;
  if (!editor) return <DocumentJson document={document} />;
  const Editor = editor.Component;
  return (
    <div
      className="relative h-full"
      data-editor={editor.config.id}
      data-document-type={document.header.documentType}
    >
      <EditorDocumentProvider document={document} dispatch={dispatch}>
        <Editor
          documentId={document.header.id}
          document={document}
          dispatch={dispatch}
          context={{ readMode: false }}
        />
      </EditorDocumentProvider>
    </div>
  );
}

function OpenDocument({ documentId }: { documentId: string }) {
  const document = useDocument(documentId);
  return document ? <DocumentView document={document} /> : null;
}

/** The drive layout: the drive app its `preferredEditor` names (given the
 * drive as `document`), else the directory listing, around the node route. */
export function DriveLayout() {
  const { drive, folder, documentId } = useDriveRouteData();
  const app = useAppModuleById(drive?.header.meta?.preferredEditor);
  const [, dispatch] = useDispatch(drive);
  const nodeId = documentId ?? folder?.id;
  const context = useMemo(
    () => drive && { drive, dispatch, folder, nodeId },
    [drive, dispatch, folder, nodeId],
  );
  if (!drive || !context) return null;
  const App = app?.Component;
  // Drive apps show their own view until they get a document to show.
  const document = documentId ? <Outlet /> : null;
  return (
    <DriveProvider value={context}>
      <EditorHost
        resetKeys={[drive.header.id]}
        label={App ? "drive app" : "drive view"}
      >
        {App ? (
          <App document={drive} dispatch={dispatch}>
            {document}
          </App>
        ) : (
          <DirectoryListing drive={drive} folder={folder}>
            {document}
          </DirectoryListing>
        )}
      </EditorHost>
    </DriveProvider>
  );
}

/** The node route: the open document, or nothing on a folder or the drive's root. */
export function NodeView() {
  const { documentId } = useDriveRouteData();
  if (!documentId) return null;
  return (
    <EditorHost resetKeys={[documentId]} label="editor">
      <OpenDocument documentId={documentId} />
    </EditorHost>
  );
}
