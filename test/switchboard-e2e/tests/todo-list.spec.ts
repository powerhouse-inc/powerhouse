/**
 * TodoList E2E Tests
 * 
 * Tests the TodoList document model via GraphQL API.
 * Document model code is pre-generated from https://github.com/powerhouse-inc/todo-demo
 */

import { expect, test } from "@playwright/test";

const GRAPHQL_ENDPOINT = "http://localhost:4001/graphql";

let driveId: string;
let documentId: string;

async function graphql(
  request: any,
  query: string,
  variables: Record<string, any> = {},
) {
  const response = await request.post(GRAPHQL_ENDPOINT, {
    headers: { "Content-Type": "application/json" },
    data: { query, variables },
  });
  return response.json();
}

function uniqueName(prefix: string): string {
  return `${prefix}-${Date.now()}`;
}

test.describe("TodoList Document Model", () => {
  test.describe.configure({ mode: "serial" });

  test("Reactor is running", async ({ request }) => {
    const result = await graphql(
      request,
      `query { __schema { queryType { name } } }`,
    );
    expect(result.data.__schema.queryType.name).toBe("Query");
  });

  test("Create a drive", async ({ request }) => {
    const driveName = uniqueName("test-drive");

    const result = await graphql(
      request,
      `
      mutation DriveCreation($name: String!) {
        addDrive(name: $name) {
          id
          slug
          name
        }
      }
    `,
      { name: driveName },
    );

    expect(result.errors).toBeUndefined();
    expect(result.data.addDrive.id).toBeTruthy();
    driveId = result.data.addDrive.id;
    console.log(`✅ Created drive: ${driveName} (ID: ${driveId})`);
  });

  test("Create a TodoList document", async ({ request }) => {
    expect(driveId).toBeTruthy();

    const docName = uniqueName("my-todos");

    const result = await graphql(
      request,
      `
      mutation CreateTodoList($driveId: String, $name: String!) {
        TodoList_createDocument(driveId: $driveId, name: $name)
      }
    `,
      { driveId, name: docName },
    );

    expect(result.errors).toBeUndefined();
    expect(result.data.TodoList_createDocument).toBeTruthy();
    documentId = result.data.TodoList_createDocument;
    console.log(`✅ Created document: ${docName} (ID: ${documentId})`);
  });

  test("Add todo items", async ({ request }) => {
    expect(driveId).toBeTruthy();
    expect(documentId).toBeTruthy();

    const todoItems = ["Learn Powerhouse", "Build awesome apps", "Ship it!"];

    for (let i = 0; i < todoItems.length; i++) {
      const result = await graphql(
        request,
        `
        mutation AddTodo($driveId: String, $docId: PHID, $input: TodoList_AddTodoItemInput) {
          TodoList_addTodoItem(driveId: $driveId, docId: $docId, input: $input)
        }
      `,
        {
          driveId,
          docId: documentId,
          input: { id: `todo-${i}`, text: todoItems[i] },
        },
      );

      expect(result.errors).toBeUndefined();
      console.log(`✅ Added: "${todoItems[i]}"`);
    }
  });

  test("Query document state", async ({ request }) => {
    expect(driveId).toBeTruthy();
    expect(documentId).toBeTruthy();

    const result = await graphql(
      request,
      `
      query GetTodoList($docId: PHID!, $driveId: PHID) {
        TodoList {
          getDocument(docId: $docId, driveId: $driveId) {
            id
            name
            revision
            state {
              items {
                id
                text
                checked
              }
              stats {
                total
                checked
                unchecked
              }
            }
          }
        }
      }
    `,
      { driveId, docId: documentId },
    );

    expect(result.errors).toBeUndefined();
    expect(result.data.TodoList.getDocument).toBeDefined();

    const doc = result.data.TodoList.getDocument;
    expect(doc.state.items.length).toBe(3);
    expect(doc.state.stats.total).toBe(3);

    console.log(`✅ Document has ${doc.state.items.length} items`);
  });
});

test.describe("Error Handling", () => {
  test("Query non-existent document returns error", async ({ request }) => {
    const result = await graphql(
      request,
      `
      query GetTodoList($docId: PHID!, $driveId: PHID) {
        TodoList {
          getDocument(docId: $docId, driveId: $driveId) {
            id
          }
        }
      }
    `,
      { driveId: "fake-drive", docId: "fake-doc" },
    );

    // Should either return null or an error
    expect(
      result.errors || result.data.TodoList.getDocument === null,
    ).toBeTruthy();
  });
});

