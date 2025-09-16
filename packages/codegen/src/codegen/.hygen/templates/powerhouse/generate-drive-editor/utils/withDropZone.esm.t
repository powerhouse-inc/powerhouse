---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/utils/withDropZone.tsx"
unless_exists: true
---
import { DropZone } from "@powerhousedao/design-system";
import type {
  DriveEditorProps,
  FileUploadProgressCallback,
} from "@powerhousedao/reactor-browser";
import { setSelectedNode, useOnDropFile } from "@powerhousedao/reactor-browser";
import type { ComponentType } from "react";

export function withDropZone<T extends DriveEditorProps>(
  WrappedComponent: ComponentType<T>,
): ComponentType<T> {
  const WithDropZoneComponent = (props: T) => {
    const onDropFile = useOnDropFile(props.editorConfig?.documentTypes);

    const onAddFile = async (
      file: File,
      parent: any,
      onProgress?: FileUploadProgressCallback,
    ) => {
      return await onDropFile(file, onProgress);
    };

    if (props.editorConfig?.dragAndDrop?.enabled) {
      return (
        <DropZone
          onAddFile={onAddFile}
          setSelectedNode={setSelectedNode}
          driveId={props.document.header.id}
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