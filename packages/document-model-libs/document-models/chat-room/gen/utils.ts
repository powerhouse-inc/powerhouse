import { DocumentModelUtils } from "document-model";
import { ChatRoomAction, ChatRoomState, ChatRoomLocalState } from "./types";
import { reducer } from "./reducer";

export const initialGlobalState: ChatRoomState = {
  id: "",
  name: "",
  description: "",
  createdAt: "2024-12-03T14:13:08.862Z",
  createdBy: "",
  messages: [],
};
export const initialLocalState: ChatRoomLocalState = {};

export const utils: DocumentModelUtils<
  ChatRoomState,
  ChatRoomAction,
  ChatRoomLocalState
> = {
  fileExtension: ".phdm",
  createState(state) {
    return {
      global: { ...initialGlobalState, ...state?.global },
      local: { ...initialLocalState, ...state?.local },
    };
  },
  createExtendedState(extendedState) {
    return baseCreateExtendedState(
      { ...extendedState, documentType: "powerhouse/chat-room" },
      utils.createState,
    );
  },
  createDocument(state) {
    return baseCreateDocument(
      utils.createExtendedState(state),
      utils.createState,
    );
  },
  saveToFile(document, path, name) {
    return baseSaveToFile(document, path, ".phdm", name);
  },
  saveToFileHandle(document, input) {
    return baseSaveToFileHandle(document, input);
  },
  loadFromFile(path) {
    return baseLoadFromFile(path, reducer);
  },
  loadFromInput(input) {
    return baseLoadFromInput(input, reducer);
  },
};


