---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/editor.tsx"
unless_exists: true
---
import { DropZoneWrapper } from "@powerhousedao/design-system";
import { useSetPHGlobalEditorConfig } from "@powerhousedao/reactor-browser";
import type { EditorProps } from "document-model";
import { DriveExplorer } from "./components/DriveExplorer.js";
import { editorConfig } from "./config.js";

export function Editor(props: EditorProps) {
  useSetPHGlobalEditorConfig(editorConfig);
  return (
    <DropZoneWrapper>
      <DriveExplorer {...props} />
    </DropZoneWrapper>
  );
}