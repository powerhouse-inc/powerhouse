import {
    BaseDocument,
    ExtendedState,
    PartialState,
    applyMixins,
    SignalDispatch,
} from "document-model";
import { ChatRoomState, ChatRoomLocalState } from "./types";
import { ChatRoomAction } from "./actions.js";
import { reducer } from "./reducer";
import utils from "./utils";
import ChatRoom_GeneralOperations from "./general-operations/object";

export * from "./general-operations/object";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
interface ChatRoom extends ChatRoom_GeneralOperations {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class ChatRoom extends BaseDocument<
  ChatRoomState,
  ChatRoomAction,
  ChatRoomLocalState
> {
  static fileExtension = ".phdm";

  constructor(
    initialState?: Partial<
      ExtendedState<
        PartialState<ChatRoomState>,
        PartialState<ChatRoomLocalState>
      >
    >,
    dispatch?: SignalDispatch,
  ) {
    super(reducer, utils.createDocument(initialState), dispatch);
  }

  public saveToFile(path: string, name?: string) {
    return super.saveToFile(path, ChatRoom.fileExtension, name);
  }

  public loadFromFile(path: string) {
    return super.loadFromFile(path);
  }

  static async fromFile(path: string) {
    const document = new this();
    await document.loadFromFile(path);
    return document;
  }
}

applyMixins(ChatRoom, [ChatRoom_GeneralOperations]);

export { ChatRoom };
