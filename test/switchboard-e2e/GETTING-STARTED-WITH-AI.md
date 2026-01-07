# Getting Started with AI-Assisted Testing

This guide explains how to use AI agents with Playwright MCP to write E2E tests for Switchboard.

---

## What is Playwright MCP?

[Playwright MCP](https://github.com/microsoft/playwright-mcp) is a Model Context Protocol server that enables AI agents to interact with web pages through structured accessibility snapshots. Instead of seeing raw HTML, the AI gets a clean representation of the page that it can reason about.

---

## Setup

### 1. Install Playwright MCP

```bash
npm install -g @playwright/mcp
```

### 2. Configure Your AI Agent

Add Playwright MCP to your AI agent's MCP configuration. For Cursor:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp"]
    }
  }
}
```

### 3. Start the Reactor

Before the AI can interact with the app, start the reactor:

```bash
cd test/switchboard-e2e
pnpm reactor
```

---

## How to Use

### Step 1: Share a Scenario

Copy a scenario from `scenarios/*.scenarios.md` and paste it to your AI agent:

> "I want to implement Scenario 3 from relational-db-processor.scenarios.md: Query Indexed Data. The reactor is running at http://localhost:4001/graphql"

### Step 2: Let AI Navigate and Explore

The AI can use Playwright MCP to:
- Navigate to the GraphQL endpoint
- Explore the schema
- Execute queries
- Observe results

### Step 3: Generate Test Code

Ask the AI to generate a Playwright test based on what it observed:

> "Based on what you found, write a Playwright test that validates this scenario"

### Step 4: Add to Test Suite

Copy the generated test into `tests/todo-list.spec.ts` and run it:

```bash
pnpm test:headed
```

---

## Example Conversation

**You:** "Navigate to http://localhost:4001/graphql and explore what queries are available"

**AI:** *Uses Playwright MCP to load the page, reads the schema*
> "I found these queries available:
> - `drives` - List all drives
> - `system` - System information
> - `TodoList` - TodoList document queries
> ..."

**You:** "Create a test that creates a drive and verifies it appears in the list"

**AI:** *Generates test code*
```typescript
test("Create and list drive", async ({ request }) => {
  // Create drive
  const createResult = await graphql(request, `
    mutation { addDrive(name: "test") { id } }
  `);
  
  // Verify in list
  const listResult = await graphql(request, `
    query { drives { id name } }
  `);
  
  expect(listResult.data.drives).toContainEqual(
    expect.objectContaining({ id: createResult.data.addDrive.id })
  );
});
```

---

## Tips for Effective AI Testing

### 1. Be Specific About URLs
Always tell the AI exactly where to navigate:
- GraphQL endpoint: `http://localhost:4001/graphql`
- Connect app: `http://localhost:3000`

### 2. Share Context
Give the AI relevant files:
- The scenario file you're implementing
- Existing test files for patterns
- GraphQL schema if available

### 3. Iterate
Start simple and add complexity:
1. First, verify the endpoint responds
2. Then, test a basic query
3. Finally, test the full scenario

### 4. Use API Tests When Possible
For GraphQL testing, direct API calls are more reliable than UI automation:

```typescript
// ✅ Preferred - Direct API call
const result = await request.post(GRAPHQL_ENDPOINT, {
  data: { query: "{ drives { id } }" }
});

// ⚠️ Use only when needed - UI automation
await page.goto(GRAPHQL_ENDPOINT);
await page.fill('[data-testid="query-input"]', '{ drives { id } }');
```

---

## Common Patterns

### GraphQL Helper Function
```typescript
async function graphql(request: any, query: string, variables = {}) {
  const response = await request.post(GRAPHQL_ENDPOINT, {
    headers: { "Content-Type": "application/json" },
    data: { query, variables },
  });
  return response.json();
}
```

### Serial Test Execution
When tests depend on each other (e.g., create drive → create document):
```typescript
test.describe("My Test Suite", () => {
  test.describe.configure({ mode: "serial" });
  
  let driveId: string;
  
  test("Create drive", async ({ request }) => {
    // ... create drive, save driveId
  });
  
  test("Use drive", async ({ request }) => {
    // ... use driveId from previous test
  });
});
```

### Unique Names
Avoid conflicts with timestamps:
```typescript
const driveName = `test-drive-${Date.now()}`;
```

---

## Troubleshooting

### AI Can't See the Page
- Make sure the reactor is running
- Check the URL is correct
- Verify no authentication is blocking access

### Tests Pass Locally But Fail in AI
- The AI might be testing against a different state
- Reset the reactor between sessions
- Use unique identifiers for test data

### AI Generates Invalid GraphQL
- Share the actual schema with the AI
- Run introspection query and share results
- Point AI to existing working tests for examples

