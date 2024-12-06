/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import { utils as documentModelUtils } from "document-model/document";

import utils from "../../gen/utils";
import {
  z,
  AddMessageInput,
  AddEmojiReactionInput,
  RemoveEmojiReactionInput,
  EditChatNameInput,
  EditChatDescriptionInput,
} from "../../gen/schema";
import { reducer } from "../../gen/reducer";
import * as creators from "../../gen/general-operations/creators";
import { ChatRoomDocument } from "../../gen/types";

describe("GeneralOperations Operations", () => {
  let document: ChatRoomDocument;

  beforeEach(() => {
    document = utils.createDocument();
  });

  const addMessage = (): [ChatRoomDocument, AddMessageInput] => {
    const input: AddMessageInput = {
      content: "Hello, World!",
      messageId: documentModelUtils.hashKey(),
      sender: {
        id: "anon-user",
        name: null,
        avatarUrl: null,
      },
      sentAt: new Date().toISOString(),
    };

    const updatedDocument = reducer(document, creators.addMessage(input));

    return [updatedDocument, input];
  };

  it("should handle addMessage operation", () => {
    const [updatedDocument, input] = addMessage();

    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].type).toBe("ADD_MESSAGE");
    expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
    expect(updatedDocument.operations.global[0].index).toEqual(0);

    expect(updatedDocument.state.global.messages).toHaveLength(1);
    expect(updatedDocument.state.global.messages[0]).toMatchObject({
      id: input.messageId,
      content: input.content,
      sender: input.sender,
      sentAt: input.sentAt,
      reactions: [],
    });
  });

  it("should handle addEmojiReaction operation", () => {
    const [doc, addMessageInput] = addMessage();

    let updatedDocument = doc;

    const addEmojiReactionInput: AddEmojiReactionInput = {
      messageId: addMessageInput.messageId,
      reactedBy: "anon-user",
      type: "THUMBS_UP",
    };

    updatedDocument = reducer(
      updatedDocument,
      creators.addEmojiReaction(addEmojiReactionInput),
    );

    expect(updatedDocument.operations.global).toHaveLength(2);
    expect(updatedDocument.operations.global[1].type).toBe(
      "ADD_EMOJI_REACTION",
    );
    expect(updatedDocument.operations.global[1].input).toStrictEqual(
      addEmojiReactionInput,
    );
    expect(updatedDocument.operations.global[1].index).toEqual(1);

    expect(updatedDocument.state.global.messages[0].reactions).toHaveLength(1);
    expect(
      updatedDocument.state.global.messages[0].reactions?.[0],
    ).toMatchObject({
      reactedBy: [addEmojiReactionInput.reactedBy],
      type: addEmojiReactionInput.type,
    });
  });

  it("should handle addEmojiReaction operation to a non existing message", () => {
    const input: AddEmojiReactionInput = {
      messageId: "invalid-message-id",
      reactedBy: "anon-user",
      type: "THUMBS_UP",
    };

    const updatedDocument = reducer(document, creators.addEmojiReaction(input));

    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].type).toBe(
      "ADD_EMOJI_REACTION",
    );
    expect(updatedDocument.operations.global[0].error).toBe(
      "Message not found",
    );
    expect(updatedDocument.state.global.messages).toHaveLength(0);
  });

  it("should handle removeEmojiReaction operation", () => {
    const [doc, addMessageInput] = addMessage();

    let updatedDocument = doc;

    const addEmojiReactionInput: AddEmojiReactionInput = {
      messageId: addMessageInput.messageId,
      reactedBy: "anon-user",
      type: "THUMBS_UP",
    };

    updatedDocument = reducer(
      updatedDocument,
      creators.addEmojiReaction(addEmojiReactionInput),
    );

    const input: RemoveEmojiReactionInput = {
      messageId: addMessageInput.messageId,
      senderId: "anon-user",
      type: "THUMBS_UP",
    };

    updatedDocument = reducer(
      updatedDocument,
      creators.removeEmojiReaction(input),
    );

    expect(updatedDocument.operations.global).toHaveLength(3);
    expect(updatedDocument.operations.global[2].type).toBe(
      "REMOVE_EMOJI_REACTION",
    );
    expect(updatedDocument.operations.global[2].input).toStrictEqual(input);
    expect(updatedDocument.operations.global[2].index).toEqual(2);

    expect(updatedDocument.state.global.messages[0].reactions).toHaveLength(1);
    expect(
      updatedDocument.state.global.messages[0].reactions?.[0]?.reactedBy,
    ).toHaveLength(0);
  });

  it("should handle editChatName operation", () => {
    const input: EditChatNameInput = {
      name: "New Chat Name",
    };

    const updatedDocument = reducer(document, creators.editChatName(input));

    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].type).toBe("EDIT_CHAT_NAME");
    expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
    expect(updatedDocument.operations.global[0].index).toEqual(0);

    expect(updatedDocument.state.global.name).toBe(input.name);
  });

  it("should handle editChatDescription operation", () => {
    const input: EditChatDescriptionInput = {
      description: "New Chat Description",
    };

    const updatedDocument = reducer(
      document,
      creators.editChatDescription(input),
    );

    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].type).toBe(
      "EDIT_CHAT_DESCRIPTION",
    );
    expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
    expect(updatedDocument.operations.global[0].index).toEqual(0);

    expect(updatedDocument.state.global.description).toBe(input.description);
  });
});
