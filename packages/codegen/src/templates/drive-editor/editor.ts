import { tsx } from "@tmpl/core";

export const driveEditorEditorFileTemplate = () =>
  tsx`
import { useSetPHDriveEditorConfig } from "@powerhousedao/reactor-browser";
import type { EditorProps } from "document-model";
import { DriveExplorer } from "./components/DriveExplorer.js";
import { editorConfig } from "./config.js";

/** Editor component for the drive editor */
export default function Editor(props: EditorProps) {
  // set the config for this drive editor
  // you can update these configs in \`./config.ts\`
  useSetPHDriveEditorConfig(editorConfig);
  return (
    <DriveExplorer {...props} />
  );
}
`.raw;
