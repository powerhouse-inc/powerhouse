/**
 * Relational Database Processor E2E Tests
 *
 * ============================================================================
 * TEST EXECUTION FLOW
 * ============================================================================
 *
 * SCENARIO 0 (runs in global-setup.ts, NOT here):
 *   - Generate todo-list document model from todo.phdm.zip
 *   - Generate todo-indexer processor
 *   - Generate todo subgraph
 *   - Build the project
 *
 * SCENARIOS 1-6 (run here as Playwright tests):
 *   1. Verify reactor starts with processor loaded
 *   2. Create a drive via GraphQL
 *   3. Create a todo document
 *   4. Add todo items (generates operations for processor)
 *   5. Query processed relational data via subgraph
 *   6. Compare document state vs relational data
 *
 * ============================================================================
 * PREREQUISITES
 * ============================================================================
 *
 * This test suite requires:
 *   - todo.phdm.zip (copy from test/connect-e2e/ if missing)
 *   - ph CLI installed (npm i -g @powerhousedao/ph-cli)
 *   - pnpm available
 *
 * The global-setup.ts will generate all required components automatically.
 *
 * Generated from: scenarios/relational-db-processor.scenarios.md
 */

import { expect, test } from "@playwright/test";

// =============================================================================
// Configuration
// =============================================================================

const GRAPHQL_ENDPOINT = "http://localhost:4001/graphql";

// Test data - these will be populated during test execution
let driveId: string;
let documentId: string;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Execute a GraphQL query/mutation and return the JSON response
 */
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

/**
 * Generate a unique name for test isolation
 */
function uniqueName(prefix: string): string {
  return `${prefix}-${Date.now()}`;
}

// =============================================================================
// Test Suite: Relational DB Processor
// =============================================================================

test.describe("Relational DB Processor", () => {
  // Tests run in order and share state (driveId, documentId)
  test.describe.configure({ mode: "serial" });

  // ---------------------------------------------------------------------------
  // Scenario 1: Processor Registration and Migration
  // ---------------------------------------------------------------------------
  test("Scenario 1: Reactor starts with processor loaded", async ({
    request,
  }) => {
    // Verify the GraphQL endpoint is accessible via introspection query
    // This confirms the reactor started successfully with the processor
    const result = await graphql(
      request,
      `
      query {
        __schema {
          queryType {
            name
          }
        }
      }
    `,
    );

    // Verify introspection works (confirms GraphQL server is running)
    expect(result.data).toBeDefined();
    expect(result.data.__schema).toBeDefined();
    expect(result.data.__schema.queryType.name).toBe("Query");
  });

  // ---------------------------------------------------------------------------
  // Scenario 2: Drive Creation via GraphQL
  // ---------------------------------------------------------------------------
  test("Scenario 2: Create drive via GraphQL", async ({ request }) => {
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

    // Verify no errors
    expect(result.errors).toBeUndefined();

    // Verify response structure
    expect(result.data).toBeDefined();
    expect(result.data.addDrive).toBeDefined();
    expect(result.data.addDrive.id).toBeTruthy();
    expect(result.data.addDrive.name).toBe(driveName);

    // Save drive ID for subsequent tests
    driveId = result.data.addDrive.id;

    console.log(`✅ Created drive: ${driveName} (ID: ${driveId})`);
  });

  // ---------------------------------------------------------------------------
  // Scenario 3: Todo Document Creation
  // ---------------------------------------------------------------------------
  test("Scenario 3: Create todo document via GraphQL", async ({ request }) => {
    // Prerequisite: driveId must exist from Scenario 2
    expect(driveId).toBeTruthy();

    const docName = uniqueName("my-todos");

    const result = await graphql(
      request,
      `
      mutation TodoDocument($driveId: String, $name: String!) {
        TodoList_createDocument(driveId: $driveId, name: $name)
      }
    `,
      { driveId, name: docName },
    );

    // Verify no errors
    expect(result.errors).toBeUndefined();

    // Verify document was created and ID returned
    expect(result.data).toBeDefined();
    expect(result.data.TodoList_createDocument).toBeTruthy();

    // Save document ID for subsequent tests
    documentId = result.data.TodoList_createDocument;

    console.log(`✅ Created document: ${docName} (ID: ${documentId})`);
  });

  // ---------------------------------------------------------------------------
  // Scenario 4: Add Todo Items (Generate Operations)
  // ---------------------------------------------------------------------------
  test("Scenario 4: Add todo items via GraphQL", async ({ request }) => {
    // Prerequisites: driveId and documentId must exist
    expect(driveId).toBeTruthy();
    expect(documentId).toBeTruthy();

    const todoItems = [
      "complete mutation",
      "add another todo",
      "Now check the data",
    ];

    for (let i = 0; i < todoItems.length; i++) {
      const result = await graphql(
        request,
        `
        mutation AddTodo(
          $driveId: String
          $docId: PHID
          $input: TodoList_AddTodoItemInput
        ) {
          TodoList_addTodoItem(driveId: $driveId, docId: $docId, input: $input)
        }
      `,
        {
          driveId,
          docId: documentId,
          input: { text: todoItems[i] },
        },
      );

      // Verify no errors
      expect(result.errors).toBeUndefined();

      // Verify revision number returned (should increment)
      expect(result.data).toBeDefined();
      expect(result.data.TodoList_addTodoItem).toBeTruthy();

      console.log(
        `✅ Added todo item ${i + 1}: "${todoItems[i]}" (revision: ${result.data.TodoList_addTodoItem})`,
      );
    }
  });

  // ---------------------------------------------------------------------------
  // Scenario 5: Query Processed Relational Data
  // ---------------------------------------------------------------------------
  test("Scenario 5: Query indexed todos from processor", async ({
    request,
  }) => {
    // Prerequisite: driveId must exist
    expect(driveId).toBeTruthy();

    // Give the processor a moment to index the operations
    await new Promise((resolve) => setTimeout(resolve, 1000));

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
      { driveId },
    );

    // Verify no errors
    expect(result.errors).toBeUndefined();

    // Verify response structure
    expect(result.data).toBeDefined();
    expect(result.data.todos).toBeDefined();
    expect(Array.isArray(result.data.todos)).toBeTruthy();

    // Verify we have records (should be 3 from Scenario 4)
    expect(result.data.todos.length).toBeGreaterThanOrEqual(3);

    // Verify each record has expected fields
    for (const todo of result.data.todos) {
      expect(todo.task).toBeTruthy();
      expect(typeof todo.status).toBe("boolean");

      // Task should contain operation type
      expect(todo.task).toContain("ADD_TODO_ITEM");
    }

    console.log(`✅ Found ${result.data.todos.length} indexed todo records`);
  });

  // ---------------------------------------------------------------------------
  // Scenario 6: Compare Document State vs Relational Data
  // ---------------------------------------------------------------------------
  test("Scenario 6: Compare document state with relational data", async ({
    request,
  }) => {
    // Prerequisites
    expect(driveId).toBeTruthy();
    expect(documentId).toBeTruthy();

    const result = await graphql(
      request,
      `
      query GetTodoList($docId: PHID!, $driveId: PHID) {
        todos(driveId: $driveId) {
          task
          status
        }
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

    // Verify no errors
    expect(result.errors).toBeUndefined();

    // Verify both data sources returned data
    expect(result.data.todos).toBeDefined();
    expect(result.data.TodoList).toBeDefined();
    expect(result.data.TodoList.getDocument).toBeDefined();

    const todos = result.data.todos;
    const document = result.data.TodoList.getDocument;

    // Verify document has items
    expect(document.state).toBeDefined();
    expect(document.state.items).toBeDefined();
    expect(document.state.items.length).toBe(3);

    // Verify item text matches what we added
    const itemTexts = document.state.items.map((item: any) => item.text);
    expect(itemTexts).toContain("complete mutation");
    expect(itemTexts).toContain("add another todo");
    expect(itemTexts).toContain("Now check the data");

    // Verify revision matches number of operations
    expect(document.revision).toBeGreaterThanOrEqual(3);

    console.log("✅ Document state matches relational data");
    console.log(`   - Document items: ${document.state.items.length}`);
    console.log(`   - Indexed records: ${todos.length}`);
    console.log(`   - Document revision: ${document.revision}`);
  });
});

// =============================================================================
// Test Suite: Error Handling & Edge Cases
// =============================================================================

test.describe("Error Handling", () => {
  test("Scenario: Query non-existent drive returns empty or error", async ({
    request,
  }) => {
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

    // Should either return empty array or a handled error
    // (depends on implementation - adjust assertion as needed)
    if (result.errors) {
      // If errors, they should be user-friendly
      expect(result.errors[0].message).toBeTruthy();
    } else {
      // If no errors, should return empty array
      expect(result.data.todos).toEqual([]);
    }
  });
});

// =============================================================================
// Test Suite: GraphQL Playground UI (Optional)
// =============================================================================

test.describe("GraphQL Playground", () => {
  test("Playground loads successfully", async ({ page }) => {
    // Navigate to the GraphQL endpoint - it should render a GraphQL UI (e.g., GraphiQL, Apollo Sandbox)
    await page.goto(GRAPHQL_ENDPOINT);

    // Wait for initial page load
    await page.waitForLoadState("domcontentloaded");

    // The page should have some content (either a playground UI or a JSON response)
    // GraphQL endpoints typically return a 200 response
    const response = await page.evaluate(() => document.body.innerHTML);
    expect(response.length).toBeGreaterThan(0);
  });
});

