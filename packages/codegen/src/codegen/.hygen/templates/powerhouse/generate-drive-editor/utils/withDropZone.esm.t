---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/utils/withDropZone.tsx"
unless_exists: true
---
import { DropZone } from "@powerhousedao/design-system";
import type { DriveEditorProps } from "@powerhousedao/reactor-browser";
import type { ComponentType } from "react";
import { useOnDropFile } from "../hooks/useOnDropFile.js";

export function withDropZone<T extends DriveEditorProps>(
  WrappedComponent: ComponentType<T>,
): ComponentType<T> {
  const WithDropZoneComponent = (props: T) => {
    const onDropFile = useOnDropFile();

    const onAddFile = async (file: File) => {
      await onDropFile(file);
    };

    if (props.editorConfig?.dragAndDrop?.enabled) {
      return (
        <DropZone onAddFile={onAddFile} style={{ height: "100%" }}>
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