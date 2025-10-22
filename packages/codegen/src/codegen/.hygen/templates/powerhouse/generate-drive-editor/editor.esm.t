---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/editor.tsx"
unless_exists: true
---
import { useSetPHDriveEditorConfig } from "@powerhousedao/reactor-browser";
import type { EditorProps } from "document-model";
import { DriveExplorer } from "./components/DriveExplorer.js";
import { editorConfig } from "./config.js";

export function Editor(props: EditorProps) {
  useSetPHDriveEditorConfig(editorConfig);
  return (
    <DriveExplorer {...props} />
  );
}