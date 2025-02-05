/**
 * This is a scaffold file meant for customization.
 * Delete the file and run the code generator again to have it reset
 */

import { actions as BaseActions, DocumentModel } from "document-model";
import { actions as ChatRoomActions, ChatRoom } from "./gen";
import { reducer } from "./gen/reducer";
import { documentModel } from "./gen/document-model";
import genUtils from "./gen/utils";
import * as customUtils from "./src/utils";
import { ChatRoomState, ChatRoomAction, ChatRoomLocalState } from "./gen/types";

const Document = ChatRoom;
const utils = { ...genUtils, ...customUtils };
const actions = { ...BaseActions, ...ChatRoomActions };

export const module: DocumentModel<
  ChatRoomState,
  ChatRoomAction,
  ChatRoomLocalState
> = {
  Document,
  reducer,
  actions,
  utils,
  documentModel,
};

export { ChatRoom, Document, reducer, actions, utils, documentModel };

export * from "./gen/types";
export * from "./src/utils";
