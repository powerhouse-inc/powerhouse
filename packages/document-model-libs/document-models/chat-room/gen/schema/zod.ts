import { z } from "zod";
import {
  AddEmojiReactionInput,
  AddMessageInput,
  ChatRoomState,
  EditChatDescriptionInput,
  EditChatNameInput,
  Message,
  Reaction,
  ReactionType,
  RemoveEmojiReactionInput,
  Sender,
} from "./types";

type Properties<T> = Required<{
  [K in keyof T]: z.ZodType<T[K], any, T[K]>;
}>;

type definedNonNullAny = {};

export const isDefinedNonNullAny = (v: any): v is definedNonNullAny =>
  v !== undefined && v !== null;

export const definedNonNullAnySchema = z
  .any()
  .refine((v) => isDefinedNonNullAny(v));

export const ReactionTypeSchema = z.enum([
  "CRY",
  "HEART",
  "LAUGH",
  "THUMBS_DOWN",
  "THUMBS_UP",
]);

export function AddEmojiReactionInputSchema(): z.ZodObject<
  Properties<AddEmojiReactionInput>
> {
  return z.object({
    messageId: z.string(),
    reactedBy: z.string(),
    type: ReactionTypeSchema,
  });
}

export function AddMessageInputSchema(): z.ZodObject<
  Properties<AddMessageInput>
> {
  return z.object({
    content: z.string(),
    messageId: z.string(),
    sender: SenderSchema(),
    sentAt: z.string().datetime(),
  });
}

export function ChatRoomStateSchema(): z.ZodObject<Properties<ChatRoomState>> {
  return z.object({
    __typename: z.literal("ChatRoomState").optional(),
    createdAt: z.string().datetime(),
    createdBy: z.string(),
    description: z.string().nullable(),
    id: z.string(),
    messages: z.array(MessageSchema()),
    name: z.string(),
  });
}

export function EditChatDescriptionInputSchema(): z.ZodObject<
  Properties<EditChatDescriptionInput>
> {
  return z.object({
    description: z.string(),
  });
}

export function EditChatNameInputSchema(): z.ZodObject<
  Properties<EditChatNameInput>
> {
  return z.object({
    name: z.string(),
  });
}

export function MessageSchema(): z.ZodObject<Properties<Message>> {
  return z.object({
    __typename: z.literal("Message").optional(),
    content: z.string().nullable(),
    id: z.string(),
    reactions: z.array(ReactionSchema()).nullable(),
    sender: SenderSchema(),
    sentAt: z.string().datetime(),
  });
}

export function ReactionSchema(): z.ZodObject<Properties<Reaction>> {
  return z.object({
    __typename: z.literal("Reaction").optional(),
    reactedBy: z.array(z.string()),
    type: ReactionTypeSchema,
  });
}

export function RemoveEmojiReactionInputSchema(): z.ZodObject<
  Properties<RemoveEmojiReactionInput>
> {
  return z.object({
    messageId: z.string(),
    senderId: z.string(),
    type: ReactionTypeSchema,
  });
}

export function SenderSchema(): z.ZodObject<Properties<Sender>> {
  return z.object({
    __typename: z.literal("Sender").optional(),
    avatarUrl: z.string().url().nullable(),
    id: z.string(),
    name: z.string().nullable(),
  });
}
