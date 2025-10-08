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

export function withDropZone<T extends ComponentType<any>>(
  WrappedComponent: T,
): T {
  const WithDropZoneComponent = (props: any) => {
    const driveId = useSelectedDriveId();
    const onDropFile = useOnDropFile();
    const isDragAndDropEnabled = useIsDragAndDropEnabled();

    const onAddFile = async (
      file: File,
      parent: any,
      onProgress?: FileUploadProgressCallback,
      resolveConflict?: ConflictResolution,
    ) => {
      return await onDropFile(file, onProgress, resolveConflict);
    };

    if (isDragAndDropEnabled && driveId) {
      return (
        <DropZone
          onAddFile={onAddFile}
          setSelectedNode={setSelectedNode}
          driveId={driveId}
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

  return WithDropZoneComponent as T;
}
