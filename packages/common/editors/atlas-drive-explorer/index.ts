import { ExtendedEditor, EditorContextProps } from "document-model-libs";
import Editor from "./editor";
import {
  DocumentDriveState,
  DocumentDriveAction,
  DocumentDriveLocalState,
} from "../../document-models/document-drive";

export const module: ExtendedEditor<
  DocumentDriveState,
  DocumentDriveAction,
  DocumentDriveLocalState,
  EditorContextProps
> = {
  Component: Editor,
  documentTypes: ["powerhouse/document-drive"],
  config: {
    id: "editor-id",
    disableExternalControls: true,
    documentToolbarEnabled: true,
    showSwitchboardLink: true,
  },
};

export default module;
