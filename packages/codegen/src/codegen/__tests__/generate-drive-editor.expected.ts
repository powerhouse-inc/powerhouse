export const EXPECTED_INDEX_CONTENT = `import { type EditorModule } from "document-model";
import { Editor } from "./editor.js";

export const module: EditorModule = {
  Component: Editor,
  documentTypes: ["powerhouse/document-drive"],
  config: {
    id: "AtlasDriveExplorer",
    name: "Atlas Drive Explorer",
  },
};`;

export const EXPECTED_EDITOR_CONTENT = `import { DropZoneWrapper } from "@powerhousedao/design-system";
import { useSetPHDriveEditorConfig } from "@powerhousedao/reactor-browser";
import type { EditorProps } from "document-model";
import { DriveExplorer } from "./components/DriveExplorer.js";
import { editorConfig } from "./config.js";

export function Editor(props: EditorProps) {
  useSetPHDriveEditorConfig(editorConfig);
  return (
    <DropZoneWrapper>
      <DriveExplorer {...props} />
    </DropZoneWrapper>
  );
}`;

export const EXPECTED_MAIN_INDEX_CONTENT = `/**
* This is a scaffold file meant for customization.
* Delete the file and run the code generator again to have it reset
*/

export { module as AtlasDriveExplorer } from './atlas-drive-explorer/index.js';`;

export const EXPECTED_HEADER_COMMENT = `/**
* This is a scaffold file meant for customization.
* Delete the file and run the code generator again to have it reset
*/`;

export const EXPECTED_EXISTING_EDITOR_EXPORT = `export { module as ExistingEditor } from './existing-editor/index.js'`;

export const EXPECTED_DRIVE_EXPLORER_EXPORT = `export { module as AtlasDriveExplorer } from './atlas-drive-explorer/index.js'`;
