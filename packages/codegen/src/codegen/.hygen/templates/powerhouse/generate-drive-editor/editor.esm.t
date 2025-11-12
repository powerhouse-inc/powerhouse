---
to: "<%= driveEditorDir %>/editor.tsx"
unless_exists: true
---
import { useSetPHDriveEditorConfig } from "@powerhousedao/reactor-browser";
import type { EditorProps } from "document-model";
import { DriveExplorer } from "./components/DriveExplorer.js";
import { editorConfig } from "./config.js";

/** Editor component for the <%= pascalCaseDriveEditorName %> drive editor */
export default function Editor(props: EditorProps) {
  // set the config for this drive editor
  // you can update these configs in `./config.ts`
  useSetPHDriveEditorConfig(editorConfig);
  return (
    <DriveExplorer {...props} />
  );
}