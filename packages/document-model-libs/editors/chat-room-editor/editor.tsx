/* eslint-disable react/jsx-no-bind */
import { EditorProps } from "document-model/document";
import {
  ChatRoomState,
  ChatRoomAction,
  ChatRoomLocalState,
  ReactionType,
  actions,
} from "../../document-models/chat-room";
import { utils as documentModelUtils } from "document-model/document";
import { ChatRoom, ChatRoomProps, MessageProps } from "./components";
import { reactionKeyToReactionType, mapReactions } from "./utils";

export type IProps = EditorProps<
  ChatRoomState,
  ChatRoomAction,
  ChatRoomLocalState
>;

export default function Editor(props: IProps) {
  const disableChatRoom = !props.context.user;

  const messages: ChatRoomProps["messages"] =
    props.document.state.global.messages.map((message) => ({
      id: message.id,
      message: message.content || "",
      timestamp: message.sentAt,
      userName: message.sender.name || message.sender.id,
      imgUrl: message.sender.avatarUrl || undefined,
      isCurrentUser: message.sender.id === props.context.user?.address,
      reactions: mapReactions(message.reactions),
    }));

  const onSendMessage: ChatRoomProps["onSendMessage"] = (message) => {
    props.dispatch(
      actions.addMessage({
        messageId: documentModelUtils.hashKey(),
        content: message,
        sender: {
          id: props.context.user?.address || "anon-user",
          name: props.context.user?.ens?.name || null,
          avatarUrl: props.context.user?.ens?.avatarUrl || null,
        },
        sentAt: new Date().toISOString(),
      }),
    );
  };

  const addReaction = (
    messageId: string,
    userId: string,
    reactionType: ReactionType,
  ) => {
    props.dispatch(
      actions.addEmojiReaction({
        messageId,
        reactedBy: userId,
        type: reactionType,
      }),
    );
  };

  const removeReaction = (
    messageId: string,
    userId: string,
    reactionType: ReactionType,
  ) => {
    props.dispatch(
      actions.removeEmojiReaction({
        messageId,
        senderId: userId,
        type: reactionType,
      }),
    );
  };

  const onClickReaction: MessageProps["onClickReaction"] = (reaction) => {
    const message = messages.find(
      (message) => message.id === reaction.messageId,
    );

    if (!message) {
      return;
    }

    const messageId = reaction.messageId;
    const reactionType = reactionKeyToReactionType(reaction.type);
    const currentUserId = props.context.user?.address || "anon-user";

    const existingReaction = message.reactions?.find(
      (r) => r.type === reaction.type,
    );

    if (existingReaction) {
      const dispatchAction = existingReaction.reactedBy.includes(currentUserId)
        ? removeReaction
        : addReaction;

      dispatchAction(messageId, currentUserId, reactionType);
    } else {
      addReaction(messageId, currentUserId, reactionType);
    }
  };

  const onSubmitTitle: ChatRoomProps["onSubmitTitle"] = (title) => {
    props.dispatch(actions.editChatName({ name: title }));
  };

  const onSubmitDescription: ChatRoomProps["onSubmitDescription"] = (
    description,
  ) => {
    props.dispatch(actions.editChatDescription({ description }));
  };

  return (
    <div
      style={{
        height: "calc(100vh - 140px)",
      }}
    >
      <ChatRoom
        description={
          props.document.state.global.description || "This is a chat room demo"
        }
        messages={messages}
        disabled={disableChatRoom}
        onClickReaction={onClickReaction}
        onSendMessage={onSendMessage}
        onSubmitDescription={onSubmitDescription}
        onSubmitTitle={onSubmitTitle}
        title={props.document.state.global.name || "Chat Room Demo"}
      />
    </div>
  );
}
