import {
  clearOpenFileUploads,
  getOpenFileUploads,
  removeOpenFileUpload,
  subscribeOpenFileUploads,
} from "@powerhousedao/connect/utils";
import { UploadFileListContainer } from "@powerhousedao/design-system/connect";
import { setSelectedNode } from "@powerhousedao/reactor-browser";
import { useSyncExternalStore } from "react";

// The floating "Uploading N documents" panel for files opened through the OS
// file association — the same design-system panel drag-and-drop uses, driven
// by the open-file upload store instead of DropZone's instance-local tracker.
// Renders nothing while no uploads are tracked.
export function OpenFileUploadList() {
  const uploads = useSyncExternalStore(
    subscribeOpenFileUploads,
    getOpenFileUploads,
  );

  return (
    <UploadFileListContainer
      uploadsArray={uploads}
      uploadsCount={uploads.length}
      removeUpload={removeOpenFileUpload}
      clearAllUploads={clearOpenFileUploads}
      setSelectedNode={setSelectedNode}
    />
  );
}
