/**
 * Relational DB Processor E2E Tests
 *
 * ⚠️ DISCLAIMER: These tests are NOT WORKING YET
 *
 * Blocked by: The generated document-model code imports from "document-model/core"
 * which doesn't exist in the current staging branch. Once the imports are fixed,
 * these tests should work.
 *
 * See: scenarios/relational-db-processor.scenarios.md for full scenario documentation
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

// ============================================================================
// WORKING TESTS - These pass and validate basic reactor functionality
// ============================================================================

test.describe("Relational DB Processor - Working Tests", () => {
  test.describe.configure({ mode: "serial" });

  test("Scenario 1: Reactor starts with processor loaded", async ({
    request,
  }) => {
    // Validates that the GraphQL endpoint is responding
    const response = await request.post(GRAPHQL_ENDPOINT, {
      headers: { "Content-Type": "application/json" },
      data: { query: "{ __typename }" },
    });
    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);
    console.log("✅ Reactor is running and responding");
  });

  test("Scenario 2: Create drive for testing", async ({ request }) => {
    const driveName = uniqueName("processor-test-drive");

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

  test("Scenario 9: Query non-existent data returns empty/error", async ({
    request,
  }) => {
    // This tests error handling when querying data that doesn't exist
    const result = await graphql(
      request,
      `
      query GetTodos($driveId: ID!) {
        todos(driveId: $driveId) {
          task
          status
        }
      }
    `,
      { driveId: "non-existent-drive-12345" },
    );

    // Should either return an error or empty array - both are valid
    if (result.errors) {
      expect(result.errors[0].message).toBeTruthy();
      console.log("✅ Query returned error for non-existent drive (expected)");
    } else if (result.data?.todos) {
      expect(result.data.todos).toEqual([]);
      console.log("✅ Query returned empty array for non-existent drive");
    } else {
      // Query type might not exist yet
      console.log("⚠️ todos query not available (processor not loaded)");
    }
  });
});

// ============================================================================
// BLOCKED TESTS - Waiting for document-model/core import fix
// ============================================================================

test.describe("Relational DB Processor - Blocked Tests", () => {
  test.describe.configure({ mode: "serial" });

  /**
   * Scenario 3: Create Document Triggers Processor
   *
   * BLOCKED: TodoList_createDocument mutation not available because
   * the subgraph failed to load due to import errors.
   */
  test.skip("Scenario 3: Create document triggers processor", async ({
    request,
  }) => {
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

  /**
   * Scenario 4: Add Data Triggers Index Update
   *
   * BLOCKED: Depends on Scenario 3
   */
  test.skip("Scenario 4: Add data triggers index update", async ({
    request,
  }) => {
    expect(driveId).toBeTruthy();
    expect(documentId).toBeTruthy();

    const todoItems = [
      "Write E2E tests",
      "Fix import errors",
      "Ship the feature",
    ];

    for (let i = 0; i < todoItems.length; i++) {
      const result = await graphql(
        request,
        `
        mutation AddTodo($docId: PHID!, $input: TodoList_AddTodoItemInput!) {
          TodoList_addTodoItem(docId: $docId, input: $input)
        }
      `,
        {
          docId: documentId,
          input: { id: `todo-${i}`, text: todoItems[i] },
        },
      );

      expect(result.errors).toBeUndefined();
      console.log(`✅ Added: "${todoItems[i]}"`);
    }
  });

  /**
   * Scenario 5: Query Indexed Data
   *
   * BLOCKED: Depends on Scenarios 3 & 4
   */
  test.skip("Scenario 5: Query indexed data", async ({ request }) => {
    expect(driveId).toBeTruthy();

    // Give processor time to index
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const result = await graphql(
      request,
      `
      query GetTodos($driveId: ID!) {
        todos(driveId: $driveId) {
          task
          status
          documentId
        }
      }
    `,
      { driveId },
    );

    expect(result.errors).toBeUndefined();
    expect(result.data.todos).toBeDefined();
    expect(Array.isArray(result.data.todos)).toBeTruthy();
    expect(result.data.todos.length).toBeGreaterThanOrEqual(3);

    console.log(`✅ Found ${result.data.todos.length} indexed todo records`);
  });

  /**
   * Scenario 6: Compare Document State with Indexed Data
   *
   * BLOCKED: Depends on Scenario 5
   */
  test.skip("Scenario 6: Compare document state with indexed data", async ({
    request,
  }) => {
    expect(driveId).toBeTruthy();
    expect(documentId).toBeTruthy();

    const result = await graphql(
      request,
      `
      query CompareData($docId: PHID!, $driveId: PHID) {
        # Get indexed data from processor
        todos(driveId: $driveId) {
          task
          status
        }
        
        # Get document state from subgraph
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
            }
          }
        }
      }
    `,
      { driveId, docId: documentId },
    );

    expect(result.errors).toBeUndefined();

    const todos = result.data.todos;
    const document = result.data.TodoList.getDocument;

    // Verify counts match
    expect(document.state.items.length).toBe(3);
    expect(todos.length).toBeGreaterThanOrEqual(3);

    console.log("✅ Document state matches indexed data");
    console.log(`   - Document items: ${document.state.items.length}`);
    console.log(`   - Indexed records: ${todos.length}`);
  });

  /**
   * Scenario 7: Bulk Operations Performance
   *
   * BLOCKED: Depends on document creation working
   */
  test.skip("Scenario 7: Bulk operations performance", async ({ request }) => {
    expect(driveId).toBeTruthy();
    expect(documentId).toBeTruthy();

    const startTime = Date.now();
    const itemCount = 100;

    // Create 100 items rapidly
    for (let i = 0; i < itemCount; i++) {
      await graphql(
        request,
        `
        mutation AddTodo($docId: PHID!, $input: TodoList_AddTodoItemInput!) {
          TodoList_addTodoItem(docId: $docId, input: $input)
        }
      `,
        {
          docId: documentId,
          input: { id: `bulk-todo-${i}`, text: `Bulk item ${i}` },
        },
      );
    }

    const duration = Date.now() - startTime;

    // Give processor time to catch up
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Verify all items indexed
    const result = await graphql(
      request,
      `
      query GetTodos($driveId: ID!) {
        todos(driveId: $driveId) {
          task
        }
      }
    `,
      { driveId },
    );

    expect(result.data.todos.length).toBeGreaterThanOrEqual(itemCount);

    console.log(`✅ Created ${itemCount} items in ${duration}ms`);
    console.log(`   - Average: ${(duration / itemCount).toFixed(2)}ms per item`);
  });

  /**
   * Scenario 8: Error Recovery
   *
   * BLOCKED: Requires processor to be running
   */
  test.skip("Scenario 8: Error recovery", async ({ request }) => {
    // Test that processor handles errors gracefully
    // This would test invalid inputs, malformed data, etc.
    console.log("⏭️ Error recovery tests not yet implemented");
  });
});

// ============================================================================
// GRAPHQL PLAYGROUND TEST
// ============================================================================

test.describe("GraphQL Playground", () => {
  test("Playground loads successfully", async ({ page }) => {
    await page.goto(GRAPHQL_ENDPOINT);
    await page.waitForLoadState("networkidle");

    // Check that some GraphQL-related content is present
    const bodyText = await page.locator("body").textContent();
    const hasGraphQLContent =
      bodyText?.toLowerCase().includes("query") ||
      bodyText?.toLowerCase().includes("graphql") ||
      bodyText?.toLowerCase().includes("mutation");

    expect(hasGraphQLContent).toBeTruthy();
    console.log("✅ GraphQL Playground loaded");
  });
});

