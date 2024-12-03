import { ExtendedEditor, EditorContextProps } from "document-model-libs";
import Editor from "./editor";

export const module: ExtendedEditor<unknown, Action, unknown, unknown> = {
  Component: Editor,
  documentTypes: ["*"],
  config: {
    id: "editor-id",
    disableExternalControls: true,
    documentToolbarEnabled: true,
    showSwitchboardLink: true,
  },
};

export default module;
