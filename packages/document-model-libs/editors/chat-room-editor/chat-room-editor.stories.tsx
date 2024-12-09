import Editor from "./editor";
import { createDocumentStory } from "document-model-libs/utils";

import * as ChatRoomModule from "../../document-models/chat-room";

const { meta, CreateDocumentStory: ChatRoom } = createDocumentStory(
  Editor,
  ChatRoomModule.reducer,
  ChatRoomModule.utils.createDocument(),
);
export { ChatRoom };

export default { ...meta, title: "Chat Room Editor" };
