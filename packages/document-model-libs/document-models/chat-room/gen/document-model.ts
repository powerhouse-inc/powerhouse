import type { DocumentModelState } from "../../../../document-model/dist/src/document-model/module.js";

export const documentModel: DocumentModelState = {
  id: "powerhouse/chat-room",
  name: "ChatRoom",
  extension: ".phdm",
  description: "Description",
  author: {
    name: "0x",
    website: "https://powerhouse.inc",
  },
  specifications: [
    {
      version: 1,
      changeLog: [],
      state: {
        global: {
          schema:
            "type ChatRoomState {\n  id: OID!\n  name: String!\n  description: String\n  createdAt: DateTime!\n  createdBy: ID!\n  messages: [Message!]!\n}\n\ntype Message {\n  id: OID!\n  sender: Sender!\n  content: String\n  sentAt: DateTime!\n  reactions: [Reaction!]\n}\n\ntype Sender {\n  id: ID!\n  name: String\n  avatarUrl: URL\n}\n\ntype Reaction {\n  type: ReactionType!         # Type of reaction (one of the predefined emoji)\n  reactedBy: [ID!]!             # Agent ID of the user who reacted\n}\n\nenum ReactionType {\n  THUMBS_UP\n  THUMBS_DOWN\n  LAUGH\n  HEART\n  CRY\n}",
          initialValue:
            '"{\\n  \\"id\\": \\"\\",\\n  \\"name\\": \\"\\",\\n  \\"description\\": \\"\\",\\n  \\"createdAt\\": \\"2024-12-03T14:13:08.862Z\\",\\n  \\"createdBy\\": \\"\\",\\n  \\"messages\\": []\\n}"',
          examples: [],
        },
        local: {
          schema: "",
          initialValue: '""',
          examples: [],
        },
      },
      modules: [
        {
          id: "K/Em4FC2mDn6EIec3sGFaEHpfHw=",
          name: "general_operations",
          description: "",
          operations: [
            {
              id: "+rTrTsaz2oomuXmTf9EmYlg2L8M=",
              name: "ADD_MESSAGE",
              description: "",
              schema:
                "input AddMessageInput {\n  messageId: OID!        # ID of the message that is being added\n  sender: Sender!          # ID of the user sending the message\n  content: String!        # Content of the message\n  sentAt: DateTime!\n}",
              template: "",
              reducer: "",
              errors: [
                {
                  id: "BYa+dXU0lytb2+58A4z2hpywzAU=",
                  name: "MessageContentCannotBeEmpty",
                  code: "",
                  description: "",
                  template: "",
                },
                {
                  id: "ZVA6sBSOVxHZXP6xaYqNvDxGneE=",
                  name: "MessageContentExceedsTheMaximumLength",
                  code: "",
                  description: "",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
            {
              id: "lGopkrwnC9h9HO4aZA2YSf0RO2I=",
              name: "ADD_EMOJI_REACTION",
              description: "",
              schema:
                "input AddEmojiReactionInput {\n  messageId: OID!         # ID of the message to which the reaction is being added\n  reactedBy: ID!         # ID of the user adding the reaction\n  type: ReactionType!     # Type of the reaction (emoji)  \n}",
              template: "",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "lrDchn0v4MAD+N6czrz773na6OY=",
              name: "REMOVE_EMOJI_REACTION",
              description: "",
              schema:
                "input RemoveEmojiReactionInput {\n  messageId: OID!   # ID of the message to which the reaction is being removed\n  senderId: ID!     # ID of the user that is removing the reaction\n  type: ReactionType!   # Type of the reaction (emoji)  \n}",
              template: "",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "KSoGfAD5eLW7JJIJOMn+SLishkI=",
              name: "EDIT_CHAT_NAME",
              description: "",
              schema: "input EditChatNameInput {\n  name: String!\n}",
              template: "",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "5HHylDd/auLeCwpybVYdzTISAzg=",
              name: "EDIT_CHAT_DESCRIPTION",
              description: "",
              schema:
                "input EditChatDescriptionInput {\n  description: String!\n}",
              template: "",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
          ],
        },
      ],
    },
  ],
};
