import { Breadcrumbs } from "@powerhousedao/design-system/connect";
import { useSetPHAppConfig } from "@powerhousedao/reactor-browser";
import type { EditorProps } from "@powerhousedao/shared/document-model";
import { CreateDocument } from "./components/create-document.js";
import FolderView from "./components/folder-view.js";
import { DriveLayout } from "./components/layout.js";
import { editorConfig } from "./config.js";

export default function Editor(props: EditorProps) {
  useSetPHAppConfig(editorConfig);
  const { className, children } = props;
  const showDocumentEditor = !!children;

  return (
    <DriveLayout className={className}>
      {!showDocumentEditor && (
        <DriveLayout.Header>
          <Breadcrumbs />
        </DriveLayout.Header>
      )}
      {showDocumentEditor ? (
        children
      ) : (
        <DriveLayout.Content>
          <FolderView />
        </DriveLayout.Content>
      )}
      {!showDocumentEditor && (
        <DriveLayout.Footer>
          <CreateDocument />
        </DriveLayout.Footer>
      )}
    </DriveLayout>
  );
}
