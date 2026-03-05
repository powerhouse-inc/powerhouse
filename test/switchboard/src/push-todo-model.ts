/**
 * Script that creates and pushes a "Todo List" document model to a switchboard.
 *
 * Usage:
 *   npx tsx src/push-todo-model.ts <switchboard-url> [drive-id]
 *
 * Example:
 *   npx tsx src/push-todo-model.ts http://localhost:4001/graphql powerhouse
 */
import { createReactorGraphQLClient } from "@powerhousedao/reactor-api";
import { RemoteDocumentController } from "@powerhousedao/reactor-browser/remote-controller";
import { DocumentModelController } from "document-model";

const switchboardUrl = process.argv[2];
const driveId = process.argv[3] ?? "powerhouse";

if (!switchboardUrl) {
  console.error(
    "Usage: npx tsx src/push-todo-model.ts <switchboard-url> [drive-id]",
  );
  process.exit(1);
}

const client = createReactorGraphQLClient(switchboardUrl);

const controller = await RemoteDocumentController.pull(
  DocumentModelController,
  {
    client,
    mode: "batch",
    parentIdentifier: driveId,
  },
);

// --- Model metadata ---

controller
  .setModelName({ name: "TodoList" })
  .setModelId({ id: "powerhouse/todo-list" })
  .setModelExtension({ extension: "phtodo" })
  .setModelDescription({
    description:
      "A simple todo list with items that can be added, completed, and removed.",
  })
  .setAuthorName({ authorName: "Powerhouse" });

// --- Global state schema ---

controller.setStateSchema({
  scope: "global",
  schema: `
type TodoItem {
  id: ID!
  title: String!
  completed: Boolean!
  createdAt: String!
}

type TodoListState {
  items: [TodoItem!]!
}
`.trim(),
});

controller.setInitialState({
  scope: "global",
  initialValue: JSON.stringify({ items: [] }),
});

controller.addStateExample({
  scope: "global",
  id: "example-with-items",
  example: JSON.stringify(
    {
      items: [
        {
          id: "1",
          title: "Buy groceries",
          completed: false,
          createdAt: "2025-01-01T00:00:00.000Z",
        },
        {
          id: "2",
          title: "Write docs",
          completed: true,
          createdAt: "2025-01-02T00:00:00.000Z",
        },
      ],
    },
    null,
    2,
  ),
});

// --- Local state (empty) ---

controller.setStateSchema({ scope: "local", schema: "" });
controller.setInitialState({ scope: "local", initialValue: "{}" });

// --- Module: Items ---

const moduleId = "items";
controller.addModule({
  id: moduleId,
  name: "Items",
  description: "Operations for managing todo items",
});

// ADD_ITEM
controller.addOperation({
  id: "add-item",
  moduleId,
  name: "ADD_ITEM",
  description: "Add a new todo item to the list",
  scope: "global",
  schema: `
input AddItemInput {
  id: ID!
  title: String!
}
`.trim(),
});

// TOGGLE_ITEM
controller.addOperation({
  id: "toggle-item",
  moduleId,
  name: "TOGGLE_ITEM",
  description: "Toggle the completed status of a todo item",
  scope: "global",
  schema: `
input ToggleItemInput {
  id: ID!
}
`.trim(),
});

// REMOVE_ITEM
controller.addOperation({
  id: "remove-item",
  moduleId,
  name: "REMOVE_ITEM",
  description: "Remove a todo item from the list",
  scope: "global",
  schema: `
input RemoveItemInput {
  id: ID!
}
`.trim(),
});

// UPDATE_ITEM_TITLE
controller.addOperation({
  id: "update-item-title",
  moduleId,
  name: "UPDATE_ITEM_TITLE",
  description: "Update the title of an existing todo item",
  scope: "global",
  schema: `
input UpdateItemTitleInput {
  id: ID!
  title: String!
}
`.trim(),
});

// --- Push to switchboard ---

console.log(
  `Pushing TodoList document model to ${switchboardUrl} (drive: ${driveId})...`,
);

const result = await controller.push();

console.log(`Done! Pushed ${result.actionCount} actions.`);
console.log(`Document ID: ${controller.status.documentId}`);
console.log(`Model name:  ${controller.state.global.name}`);
console.log(`Model ID:    ${controller.state.global.id}`);
console.log(
  `Operations:  ${controller.state.global.specifications[0]?.modules[0]?.operations.map((o) => o.name).join(", ")}`,
);
