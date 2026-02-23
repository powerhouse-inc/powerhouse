import { Breadcrumbs } from "@powerhousedao/design-system/connect";
import { useDrop } from "@powerhousedao/design-system/connect";
import { useSetPHDriveEditorConfig } from "@powerhousedao/reactor-browser";
import type { EditorProps } from "document-model";
import { CreateDocument } from "./components/create-document.js";
import FolderView from "./components/folder-view.js";
import { DriveLayout } from "./components/layout.js";
import { editorConfig } from "./config.js";

export default function Editor(props: EditorProps) {
  useSetPHDriveEditorConfig(editorConfig);
  const { className, children } = props;
  const { isDropTarget, dropProps } = useDrop();
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
        <DriveLayout.Content
          {...dropProps}
          className={isDropTarget ? "rounded-xl bg-blue-100" : ""}
        >
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
