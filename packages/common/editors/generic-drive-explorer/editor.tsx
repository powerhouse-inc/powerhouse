import { CreateDocument, DriveLayout, FolderView } from "@powerhousedao/common";
import { Breadcrumbs, useDrop } from "@powerhousedao/design-system";
import { useSetPHDriveEditorConfig } from "@powerhousedao/reactor-browser";
import type { EditorProps } from "document-model";
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
