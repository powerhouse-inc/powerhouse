# Step 1 - Generate the `TodoList` document model

## Overview

This tutorial guides you through creating a simplified version of a 'Powerhouse project' for a **To-do List**.  
A Powerhouse project primarily consists of a document model and its editor. 
As your projects use-case expands you can add data-integrations or a specific drive-app as seen in the demo package. 

For todays purpose, you'll be using Connect, our user-centric collaboration tool and Vetra Studio, the builder tooling through which developers can access and manage specifications of your project. 

## Develop a single document model in Connect

Once in the project directory, run the `pnpm connect` command to start a local instance of the Connect application. This allows you to start your document model specification document.
Run the following command to start the Connect application:

    ```bash
    pnpm connect
    ```

The Connect application will start and you will see the following output:

    ```bash
      ➜  Local:   http://localhost:3000/
      ➜  Network: http://192.168.5.110:3000/
      ➜  press h + enter to show help
    ```

A new browser window will open and you will see the Connect application. If it doesn't open automatically, you can open it manually by navigating to `http://localhost:3000/` in your browser. You will see your local drive and a button to create a new drive.

:::tip 
If you local drive is not present navigate into Settings in the bottom left corner. Settings > Danger Zone > Clear Storage.
Clear the storage of your localhost application as it might has an old session cached.
:::

4. Move into your local drive.  
   Create a new document model by clicking the `DocumentModel` button, found in the 'New Document' section at the bottom of the page. Name your document `Todo List`.

If you've followed the steps correctly, you'll have an empty `TodoList` document where you can define the **'Document Specifications'**.

## TodoList document specification

To start, fill in the following details for your new document model:

Name: `Todo List`
Document type: `powerhouse/todo-list`
Author name: Powerhouse
Website URL: https://powerhouse.inc

It's important that you use these exact details so that your generated code matches the generated code in the tutorial repository.

We'll continue with this project to teach you how to create a document model specification and later an editor for your document model. We use the **GraphQL Schema Definition Language** (SDL) to define the schema for the document model.  
Below, you can see the SDL for the `TodoList` document model.

:::info
This schema defines the **data structure** of the document model and the types involved in its operations, which are detailed further as input types.
Documents in Powerhouse leverage **event sourcing principles**, where every state transition is represented by an operation. GraphQL input types describe operations, ensuring that user intents are captured effectively. These operations detail the parameters needed for state transitions. The use of GraphQL aligns these transitions with explicit, validated, and reproducible commands.
:::

## The document model state schema

First, let's add a GraphQL type that represents an individual item in a todo-list document. A todo item has an ID, text, and can be either checked or unchecked.

Add this underneath the boilerplate `TodoListState` type you see in the Global State Schema text editor.

```graphql
# Defines a GraphQL type for a single to-do item
type TodoItem {
  id: OID! # Unique identifier for each to-do item
  text: String! # The text description of the to-do item
  checked: Boolean! # Status of the to-do item (checked/unchecked)
}
```

Now update the `TodoListState` type to use our new type by replacing the boilerplate with this:

```graphql
type TodoListState {
  items: [TodoItem!]!
}
```

The final result in your editor should look like this:

```graphql
type TodoListState {
  items: [TodoItem!]!
}

# Defines a GraphQL type for a single to-do item
type TodoItem {
  id: OID! # Unique identifier for each to-do item
  text: String! # The text description of the to-do item
  checked: Boolean! # Status of the to-do item (checked/unchecked)
}
```

With our state schema defined, go ahead and click the "Sync with schema" button underneath "Global State Initial Value". This will set the initial state for the documents you create with this model based on the schema you defined.

Your initial value field should now look like this:

```json
{
  "items": []
}
```

## Operation inputs and their schemas

We've defined the shape for the state of our `TodoList` documents, but we also need to be able to update them.

Documents are updated by dispatching actions, which are applied to documents as operations.

We define modules to group sets of operations together. In this simple case, we will only need one module.

Add a new module for our `todos` operations by typing `todos` in the "Add new module" input and pressing enter.

We need to add three different operations to this module:

1. add todo item
2. update todo item
3. delete todo item

Let's start with adding todos.

When we add a new todo, the only input we need to provide is the text. Creating the ID will be handled later in our reducer code, and todos always start as unchecked by default.

type `add todo item` in the "Add new operation" input and press enter.

You will see your new operation with the name `ADD_TODO_ITEM` (we automatically handle changing the casing to the required CONSTANT_CASE).

You will also see a boilerplate placeholder GraphQL input.

Update the GraphQL input like so:

```graphql
input AddTodoItemInput {
  text: String!
}
```

Next let's handle updating todo items.

Type `update todo item` in the "Add new operation" input and press enter.

For updating items, we will need to provide an `id` so we know which one to update. We can use the same operation to update the text or the checked state, so both of these fields are optional (no ! on the field).

Update the `UpdateTodoItemInput` to be like so:

```graphql
input UpdateTodoItemInput {
  id: OID!
  text: String
  checked: Boolean
}
```

Finally, we can handle the delete item operation.

type `delete todo item` in the "Add new operation" input.

For deleting items, all we need is an `id`.

Update your `DeleteTodoItemInput` to be like this:

```graphql
input DeleteTodoItemInput {
  id: OID!
}
```

Once you have added all the input operations, click the `Export` button at the top right of the editor to save the document model specification document to your local machine. Ideally, you should save your file in the root of your repository with the name `todo-list.phd`

## Generating your document model code

With our newly created document model, we can run the codegen to generate the rest of the code for it.

To run the codegen, you use the `generate` command with a path to the file you just exported. 

```bash
pnpm generate ./todo-list.phd
```

**NOTE:** this generated code contains values that will always be different for each generated document model, like module ids for example. For the purposes of this tutorial, we recommend that you instead use the reference example that we have already included in the repo for you — this will make your generated code look exactly the same as the generated code in the branches in the repo, and your diffs will match exactly.

To use our reference example, run:

```bash
pnpm generate ./todo-list.phdm.phd
```

This will overwrite your generated code with code that is identical to the branches in this repository.

## Check your work

To make sure all works as expected, we should:

- check types
run: `pnpm tsc`

- check linting
run: `pnpm lint`

- check tests
run: `pnpm test`

- make sure your code matches the code in the completed step branch
run: `git diff your-branch-name step-1-complete-generated-todo-list-document-model`

### Up next: reducers and operations

Up next, you'll learn how to implement the runtime logic and components that will use the `TodoList` document model specification you've just created and exported.