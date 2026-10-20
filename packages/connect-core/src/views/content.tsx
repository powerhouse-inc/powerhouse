import {
  useAppModuleById,
  useDocument,
  useEditorModuleById,
  useFallbackEditorModule,
  useRevisionHistoryVisible,
} from "@powerhousedao/reactor-browser";
import type { PHDocument } from "@powerhousedao/shared/document-model";
import { Outlet } from "@tanstack/react-router";
import { useDriveRouteData } from "../router/route-data.js";
import { RouteSelection } from "../router/route-selection.js";
import { DirectoryListing } from "./directory-listing.js";
import { DocumentHistory } from "./document-history.js";
import { DocumentJson } from "./document-json.js";
import { EditorHost } from "./editor-host.js";

/** `document`: its revision history while `?history` is set, else its
 * registered editor, else its JSON. */
export function DocumentView({ document }: { document: PHDocument }) {
  const preferred = useEditorModuleById(document.header.meta?.preferredEditor);
  const fallback = useFallbackEditorModule(document.header.documentType);
  const historyVisible = useRevisionHistoryVisible();
  const editor = preferred ?? fallback;
  if (historyVisible) return <DocumentHistory document={document} />;
  if (!editor) return <DocumentJson document={document} />;
  const Editor = editor.Component;
  return (
    <div
      className="relative h-full"
      data-editor={editor.config.id}
      data-document-type={document.header.documentType}
    >
      <Editor documentId={document.header.id} context={{ readMode: false }} />
    </div>
  );
}

function OpenDocument({ documentId }: { documentId: string }) {
  const document = useDocument(documentId);
  return document ? <DocumentView document={document} /> : null;
}

/** The drive layout: the drive app its `preferredEditor` names, else the
 * directory listing, around the node route. */
export function DriveLayout() {
  const { drive, folder, documentId } = useDriveRouteData();
  const app = useAppModuleById(drive?.header.meta?.preferredEditor);
  if (!drive) return null;
  const App = app?.Component;
  // Drive apps show their own view until they get a document to show.
  const document = documentId ? <Outlet /> : null;
  return (
    <RouteSelection>
      <EditorHost
        resetKeys={[drive.header.id]}
        label={App ? "drive app" : "drive view"}
      >
        {App ? (
          <App>{document}</App>
        ) : (
          <DirectoryListing drive={drive} folder={folder}>
            {document}
          </DirectoryListing>
        )}
      </EditorHost>
    </RouteSelection>
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
