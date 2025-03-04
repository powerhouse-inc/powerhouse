# Reading & Writing with the API

## Introduction to Switchboard

**Switchboard** is the API interface that allows developers and data engineers to get access to the data, that is being collected through the use of document models in Connect & Fusion.
After structurally capturing the desired data of your formalised business processes the data can be used to build insightful experiences in external websites, drive widgets or create specific reports and dashboard in fusion. 
**Since your document models have been defined with a GraphQL schema, you can use the same objects and fields in your queries and mutations to retrieve or write data from and to your document models.**

<details>
  <summary>Get your Switchboard API token (if required)</summary>

Your API requests are authenticated using API keys or tokens. Any request that doesn't include an API key will return an error. You can generate an API token from your Switchboard instance at any time [by logging in with your Ethereum address here](https://apps.powerhouse.io/develop/powerhouse/switchboard/user).

</details>

## Querying a document with the GraphQL API

### Starting the reactor locally

In this documentation we'll show how to use a **GraphQL** query to query a document model. We'll **continue on the ToDoList example** from our [introduction tutorial](/docs/academy/Create/ToDoList/DefineToDoListDocumentModel) , but the process can be applied to any other document model.
To make our document model available in the Apollo Studio Sandbox we'll need to store it on a remote [Reactor](/docs/academy/AdvancedTopics/WorkingWithTheReactor).

:::info
**Powerhouse Reactors** are the nodes in the network that store documents, resolve conflicts and rerun operations to verify document event histories. 
Reactors can be configured for local storage, centralized cloud storage or on a decentralized storage network. 

A reactor allows you to store multiple documents, but also host **drives** with different organisational purposes, users, access rights and more.
:::

Just like we can run Connect locally in studio mode we can run a Reactor locally.   
Use the following commands:

```bash
ph-reactor
```
or
```bash
npm run ph-reactor
```

To start both Connect and a Reactor locally at the same time in a Powerhouse project you can use the following command:
```bash
npm run dev
```

It will return a url to access the Reactor.
```bash
[Reactor]:   ➜  Reactor:   http://localhost:4001/d/powerhouse
```

### Adding a remote drive or reactor to Connect:

If the remote Drive or Reactor isn't present yet in connect you can add it by clicking the (+) button in the Connect Drive navigation and using the localhost url to add a new drive with it's underlying reactor. 
Get access to an organisations drive instances by adding their drive to your Connect Drive navigation tree view with the helpf of the correct drive url. 
click the (+) to add a public drive. To add a new drive you'll have to know the correct public URL of the drive.

## Querying the state of a document

Now that we have our remote reactor and/or drive running we can store our document model on it.   
Let's quickly create a new **todo list document** to test the process.

Add to following todo's to your list:
- [ ] Sign up for Powerhouse
- [ ] Do the work 
- [ ] Deliver the work
- [ ] Send the invoice
- [ ] Get paid

Now that we have some data in our document model we can query it through the GraphQL API.

### 1. The complete state of the document: 

Whenever you want to start a query from a document within connect you can open up switchboard by looking for the Switchboard logo in the top right hand corner of the document editor interface. 
This will prepopulate the Apollo Studio Sandbox with the correct **DocumentID** for your document model. This feature will not be available for documents stored on local drives.

The documentation on the left hand side of the Apollo Sandbox will show you all of the different fields that are available to query.

![Example query of a document](./images/documentid.png)

Alternatively we can just use our reactor url and endpoint to figure out the document id.  
We can find out what the id of our document is by querying the drive for it's documents.   
Since we only have one document in our drive it will return the id of our todo list document.

This example query is structured to request a document by its unique identifier (id).   
It extracts common fields such as id, name, documentType, revision, created, and lastModified.

Let's query for the content of the operations and compare the results with the document operation history. 

Side by side you can see the document content and the operation history.

Below is the operation history of the todo list document. As you can see the operations are logged in the order they were executed.
As you can see there is a 'Delete' operation in the history on revision 5 as we forgot to add 'Send the invoice' to our list. Often a crucial step to get paid! 
![Operation History](./images/operationhistory.png)

Now let's query the content of the document using Apollo Studio Sandbox. The left sidebar shows the schema documentation, where you can explore all available fields and types for your document model. 

For our TodoList document, let's construct a query that fetches the operations with the help of a nested operations field

```graphql
query {
  document(id: "...") {
    name
    documentType
    revision
    created
    lastModified
    ... on TodoList {
      operations {
        type
        id
        inputText
      }
    }
  }
}
```

This query will return all operations performed on the document, including ADD_TODO_ITEM and DELETE_TODO_ITEM operations, allowing us to see the complete history of changes.

## Writing to a document

Now that we know how to query the state of a document we can start to write to it.