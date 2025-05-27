
# Implement Operation Reducers

In this section, we will implement and test the operation reducers for the `ChatRoom` document model. In order to do this, you have to export the document model from the Connect application and import it into your powerhouse project directory. 

To export the document model, follow the steps in the `Define Chatroom Document Model` section.

## Import Document Model and Generate Code

To import the document model into your powerhouse project, you can either:
 
- Copy&Paste the file directly into the root of your powerhouse project.
- Or drag&drop the file into the powerhouse project directory in the VSCode editor as seen in the image below:

Either step will import the document model into your powerhouse project.

![vscode image](image-4.png)

The next steps will take place in the VSCode editor. Make sure to have it open and the terminal window inside vscode open as well. 


To write the opearation reducers of the `ChatRoom` document model, you need to generate the document model code from the document model file you have exported into the powerhouse project directory.

To do this, run the following command in the terminal:

```bash
ph generate ChatRoom.phdm.zip
```
You will see that this action created a range of files for you. Before diving in we'll look at this simple schema to make you familiar with the structure you've defined in the document model once more. It shows how each type is connected to the next one.
 
![Chatroom-demo Schema](image.png)

Now you can navigate to `/document-models/chat-room/src/reducers/general-operations.ts` and start writing the operation reducers.

Open the `general-operations.ts` file and you should see the code that needs to be filled for the five operations you have defined earlier. Image below shows the code that needs to be filled:

![chatroom ts file](image-5.png)

## Write the Operation Reducers

1. Copy&paste the code below into the `general-operations.ts` file in the `reducers` folder.
2. Save the `general-operations.ts` file.


```typescript
/**
 * This is a scaffold file meant for customization:
 * - modify it by implementing the reducer functions
 * - delete the file and run the code generator again to have it reset
 */

import { ChatRoomAddMessageOperations } from "../../gen/add-message/operations";
import { MessageContentCannotBeEmpty } from "../../gen/add-message/error";

export const reducer: ChatRoomAddMessageOperations = {
  addMessageOperation(state, action, dispatch) {
    if (action.input.content === "") {
      throw new MessageContentCannotBeEmpty();      // Your reducer exception is used here as a custom error.
    }

    state.messages.push({
      id: action.input.messageId,
      content: action.input.content,
      sender: action.input.sender,
      sentAt: action.input.sentAt,
      reactions: [],
    });
  },
  addEmojiReactionOperation(state, action, dispatch) {
    const message = state.messages.find(
      (message) => message.id === action.input.messageId,    // the reducer checks the existence of the message you want to react to.
    );

    if (!message) {
      throw new Error("Message not found");        
    }

    const reactions = message.reactions || [];

    const existingReaction = reactions.find(
      (reaction) => reaction.type === action.input.type,
    );

    if (existingReaction) {                                  // if the message reaction exists a new reactedBy gets added.
      message.reactions = reactions.map((reaction) => {
        if (reaction.type === action.input.type) {
          return {
            ...reaction,
            reactedBy: [...reaction.reactedBy, action.input.reactedBy],
          };
        }

        return reaction;
      });
    } else {
      message.reactions = [
        ...reactions,
        {
          reactedBy: [action.input.reactedBy],      // if the message reaction doesn't exist yet a new reaction gets created
          type: action.input.type,
        },
      ];
    }

    state.messages = state.messages.map((_message) => {      // the state of the chatroom documents messages gets updated
      if (_message.id === message.id) {
        return message;
      }

      return _message;
    });
  },
  removeEmojiReactionOperation(state, action, dispatch) {   // To remove a reaction the address is removed from the reactedBy object in the reactions type. 
    state.messages = state.messages.map((message) => {
      if (message.id === action.input.messageId) {
        message.reactions = (message.reactions || []).map((reaction) => {
          if (reaction.type === action.input.type) {
            return {
              ...reaction,
              reactedBy: reaction.reactedBy.filter(
                (reactedBy) => reactedBy !== action.input.senderId,     // We're removing the sender of the reaction from the the reactedBy object
              ),
            };
          }

          return reaction;
        });
      }

      return message;       // We're updating the document state with our changes 
    });
  },
  editChatNameOperation(state, action, dispatch) {
    state.name = action.input.name || "";
  },
  editChatDescriptionOperation(state, action, dispatch) {
    state.description = action.input.description || "";
  },
};
```

## Write the Operation Reducers Tests

In order to make sure the operation reducers are working as expected before implementing an editor interface, you need to write tests for them.

The auto generated test will only validate if an action or message in our case is included but will not verify if the reducer mutation is succesfull. This is the type of test you'll have to write as a developer. 

Navigate to `/document-models/chat-room/src/tests/general-operations.test.ts` and copy&paste the code below into the file. Save the file.

Here are the tests for the five operations written in the reducers file. 

```typescript
/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import { generateMock } from "@powerhousedao/codegen";
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
import * as creators from "../../gen/add-message/creators";
import { ChatRoomDocument } from "../../gen/types";

describe("AddMessage Operations", () => {
  let document: ChatRoomDocument;

  beforeEach(() => {
    document = utils.createDocument();
  });

  const addMessage = (): [ChatRoomDocument, AddMessageInput] => {           // This is a helper function for our upcoming test
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

    expect(updatedDocument.operations.global).toHaveLength(1);              // We're validating that the message is being added to the operations history 
    expect(updatedDocument.operations.global[0].type).toBe("ADD_MESSAGE");
    expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
    expect(updatedDocument.operations.global[0].index).toEqual(0);
    
    expect(updatedDocument.state.global.messages).toHaveLength(1);          // We're validating that the message is present in the message state of the document
    expect(updatedDocument.state.global.messages[0]).toMatchObject({
      id: input.messageId,
      content: input.content,
      sender: input.sender,
      sentAt: input.sentAt,
      reactions: [],                                                         // We also want to make sure that reaction object is an empty array 
    });
  });

  it("should handle addEmojiReaction operation", () => {                     // We're validating that we can react using an emoji with a helper function
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

    expect(updatedDocument.operations.global).toHaveLength(2);          // We're validating that the emoji reaction is added to the operation history of the doc. 
    expect(updatedDocument.operations.global[1].type).toBe(
      "ADD_EMOJI_REACTION",
    );
    expect(updatedDocument.operations.global[1].input).toStrictEqual(
      addEmojiReactionInput,
    );
    expect(updatedDocument.operations.global[1].index).toEqual(1);

    expect(updatedDocument.state.global.messages[0].reactions).toHaveLength(1);     // We're validating that the message we created has only one reaction
    expect(
      updatedDocument.state.global.messages[0].reactions?.[0],
    ).toMatchObject({
      reactedBy: [addEmojiReactionInput.reactedBy],                                 // We're validating that reactedBy object only contains the right address
      type: addEmojiReactionInput.type,                                          
    });
  });

  it("should handle addEmojiReaction operation to a non existing message", () => {  // We're testing that an error is thrown when reacting to a non-existing message
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

  it("should handle removeEmojiReaction operation", () => {             // We're making use of a helper function to check if we can remove an EmojiReaction
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

    const input: RemoveEmojiReactionInput = {                        // We're validating the removal of a message by our anon-user with a specific messageId 
      messageId: addMessageInput.messageId,
      senderId: "anon-user",
      type: "THUMBS_UP",
    };

    updatedDocument = reducer(
      updatedDocument,
      creators.removeEmojiReaction(input),
    );

    expect(updatedDocument.operations.global).toHaveLength(3);      // We're validating that the operation was added to the operation history.
    expect(updatedDocument.operations.global[2].type).toBe(
      "REMOVE_EMOJI_REACTION",
    );
    expect(updatedDocument.operations.global[2].input).toStrictEqual(input);
    expect(updatedDocument.operations.global[2].index).toEqual(2);

    expect(updatedDocument.state.global.messages[0].reactions).toHaveLength(1);         // The reaction should still exist but no-one should have reacted to it
    expect(
      updatedDocument.state.global.messages[0].reactions?.[0]?.reactedBy,
    ).toHaveLength(0);
  });

  it("should handle editChatName operation", () => {            
    const input: EditChatNameInput = {
      name: "New Chat Name",
    };

    const updatedDocument = reducer(document, creators.editChatName(input));

    expect(updatedDocument.operations.global).toHaveLength(1);                      // We're validating that the operation is added to the operations history
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

    expect(updatedDocument.operations.global).toHaveLength(1);          // We're validating that the operation is added to the operations history
    expect(updatedDocument.operations.global[0].type).toBe(
      "EDIT_CHAT_DESCRIPTION",
    );
    expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
    expect(updatedDocument.operations.global[0].index).toEqual(0);

    expect(updatedDocument.state.global.description).toBe(input.description);
  });
});
```



Now you can run the tests to make sure the operation reducers are working as expected.

```bash
npm run test
```

Output should be as follows:

```bash
 Test Files  2 passed (2)
      Tests  7 passed (7)
   Start at  15:19:52
   Duration  3.61s (transform 77ms, setup 0ms, collect 3.50s, tests 14ms, environment 0ms, prepare 474ms)
```

If you got the same output, you have successfully implemented the operation reducers and tests for the `ChatRoom` document model.
Continue to the next section to learn how to implement the document model editor so you can see a simple user interface for the `ChatRoom` document model in action. 
