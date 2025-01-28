import { DocumentModelUtils, utils as base } from "document-model/document";
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

const utils: DocumentModelUtils<
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
    return base.createExtendedState(
      { ...extendedState, documentType: "powerhouse/chat-room" },
      utils.createState,
    );
  },
  createDocument(state) {
    return base.createDocument(
      utils.createExtendedState(state),
      utils.createState,
    );
  },
  saveToFile(document, path, name) {
    return base.saveToFile(document, path, ".phdm", name);
  },
  saveToFileHandle(document, input) {
    return base.saveToFileHandle(document, input);
  },
  loadFromFile(path) {
    return base.loadFromFile(path, reducer);
  },
  loadFromInput(input) {
    return base.loadFromInput(input, reducer);
  },
};

export default utils;
