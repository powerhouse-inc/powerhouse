import { DropZone } from "@powerhousedao/design-system";
import type {
  ConflictResolution,
  DriveEditorProps,
  FileUploadProgressCallback,
} from "@powerhousedao/reactor-browser";
import {
  setSelectedNode,
  useOnDropFile,
  useSelectedDriveId,
} from "@powerhousedao/reactor-browser";
import type { ComponentType } from "react";

export function withDropZone<T extends DriveEditorProps>(
  WrappedComponent: ComponentType<T>,
): ComponentType<T> {
  const WithDropZoneComponent = (props: T) => {
    const driveId = useSelectedDriveId();
    const onDropFile = useOnDropFile(props.editorConfig?.documentTypes);

    const onAddFile = async (
      file: File,
      parent: any,
      onProgress?: FileUploadProgressCallback,
      resolveConflict?: ConflictResolution,
    ) => {
      return await onDropFile(file, onProgress, resolveConflict);
    };

    if (props.editorConfig?.dragAndDrop?.enabled) {
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

  return WithDropZoneComponent;
}
