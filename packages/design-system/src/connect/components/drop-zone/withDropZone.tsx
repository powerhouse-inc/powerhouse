import { DropZone } from "@powerhousedao/design-system";
import type {
  ConflictResolution,
  FileUploadProgressCallback,
} from "@powerhousedao/reactor-browser";
import {
  setSelectedNode,
  useIsDragAndDropEnabled,
  useOnDropFile,
  useSelectedDriveId,
} from "@powerhousedao/reactor-browser";
import type { ComponentType } from "react";

export function withDropZone(WrappedComponent: ComponentType): ComponentType {
  const WithDropZoneComponent = (props: any) => {
    const driveId = useSelectedDriveId();
    const isDragAndDropEnabled = useIsDragAndDropEnabled();
    const onDropFile = useOnDropFile();

    const onAddFile = async (
      file: File,
      parent: any,
      onProgress?: FileUploadProgressCallback,
      resolveConflict?: ConflictResolution,
    ) => {
      return await onDropFile(file, onProgress, resolveConflict);
    };

    if (isDragAndDropEnabled) {
      return (
        <DropZone
          driveId={driveId}
          onAddFile={onAddFile}
          setSelectedNode={setSelectedNode}
          useLocalStorage={true}
          style={{ height: "100%" }}
        >
          <WrappedComponent {...props} />
        </DropZone>
      );
    }

    return <WrappedComponent {...props} />;
  };

  WithDropZoneComponent.displayName = `withDropZone(${
    WrappedComponent.displayName || WrappedComponent.name || "Component"
  })`;

  return WithDropZoneComponent;
}
