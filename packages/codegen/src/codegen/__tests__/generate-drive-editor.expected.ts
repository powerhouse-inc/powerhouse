export const EXPECTED_INDEX_CONTENT = `import { type DriveEditorModule } from "@powerhousedao/reactor-browser";
import { Editor } from "./editor.js";

export const module: DriveEditorModule = {
  Component: Editor,
  documentTypes: ["powerhouse/document-drive"],
  config: {
    id: "AtlasDriveExplorer",
    disableExternalControls: true,
    documentToolbarEnabled: true,
    showSwitchboardLink: true,  },
};`;

export const EXPECTED_EDITOR_CONTENT = `import { withDropZone } from "@powerhousedao/design-system";
import { DriveExplorer } from "./components/DriveExplorer.js";

export const Editor = withDropZone(DriveExplorer);
`;

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
