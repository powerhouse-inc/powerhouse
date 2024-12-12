import Editor from "./editor";
import {
  ChatRoomState,
  ChatRoomAction,
  ChatRoomLocalState,
} from "../../document-models/chat-room";
import type { EditorContextProps, ExtendedEditor } from "../types";

export const module: ExtendedEditor<
  ChatRoomState,
  ChatRoomAction,
  ChatRoomLocalState,
  EditorContextProps
> = {
  Component: Editor,
  documentTypes: ["powerhouse/chat-room"],
  config: {
    id: "chatroom-editor",
    disableExternalControls: true,
    documentToolbarEnabled: true,
    showSwitchboardLink: true,
  },
};

export default module;
