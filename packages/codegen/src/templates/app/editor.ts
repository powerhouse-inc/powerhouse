import { tsx } from "@tmpl/core";

export const appEditorFileTemplate = () =>
  tsx`
/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { useSetPHAppConfig } from "@powerhousedao/reactor-browser";
import type { EditorProps } from "document-model";
import { DriveExplorer } from "./components/DriveExplorer.js";
import { editorConfig } from "./config.js";

/** Editor component for the app */
export default function Editor(props: EditorProps) {
  // set the config for this app
  // you can update these configs in \`./config.ts\`
  useSetPHAppConfig(editorConfig);
  return (
    <div className="bg-background p-6">
      <DriveExplorer {...props} />
    </div>
  );
}
`.raw;
