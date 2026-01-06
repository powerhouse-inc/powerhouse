# Writing Tests with AI Assistance

This guide helps non-technical team members write Playwright tests using AI agents.

## Option 1: Playwright MCP in Cursor

### Setup (One-Time)

1. **Install Playwright MCP** - Open your terminal and run:
   ```bash
   npx @playwright/mcp@latest --help
   ```
   This installs the Playwright MCP server.

2. **Add to Cursor** - Add this to your Cursor MCP settings (`.cursor/mcp.json` or via Settings → MCP):
   ```json
   {
     "mcpServers": {
       "playwright": {
         "command": "npx",
         "args": [
           "@playwright/mcp@latest",
           "--browser=chromium"
         ]
       }
     }
   }
   ```

3. **Restart Cursor** - The Playwright MCP will now be available.

### How to Use

Once set up, you can ask Claude in Cursor to:

- **"Navigate to http://localhost:4001/graphql and tell me what you see"**
- **"Click on the Query tab and enter this GraphQL query: { todos { task } }"**
- **"Take a screenshot of the result"**
- **"Generate a Playwright test for what we just did"**

### Example Conversation

```
You: "I want to test that our GraphQL endpoint returns todos. 
     Can you navigate to localhost:4001/graphql and run this query:
     query { todos(driveId: "powerhouse") { task status } }"

Claude: [Uses Playwright MCP to navigate, enter query, execute it]
        "I navigated to the GraphQL playground and executed the query.
         Here's what I found: [shows results]
         
         Would you like me to generate a Playwright test for this?"

You: "Yes, please generate the test"

Claude: [Generates test code based on the interaction]
```

---

## Option 2: Scenario-to-Test Conversion

Even without Playwright MCP, you can use your scenario documentation to generate tests.

### Step-by-Step Process

1. **Start with a scenario** (from `scenarios/*.scenarios.md`)

2. **Ask Claude to convert it to a test:**
   
   ```
   "Convert Scenario 2 from relational-db-processor.scenarios.md 
    into a Playwright test using the API testing approach"
   ```

3. **Review and refine** the generated test

4. **Ask Claude to run it** (if Playwright MCP is available)

---

## Option 3: Test Recording with Playwright Codegen

Playwright has a built-in test recorder that doesn't require coding:

### Setup
```bash
cd test/switchboard-e2e
npx playwright codegen http://localhost:4001/graphql
```

### What Happens
1. A browser opens with recording enabled
2. You interact with the page (click buttons, fill forms)
3. Playwright generates test code for each action
4. Copy the generated code into a `.spec.ts` file

### Best For
- UI interactions (clicking, filling forms)
- Recording exact selectors
- Learning Playwright syntax

---

## Recommended Workflow for Product Managers

### Phase 1: Document Scenarios 
- Write scenarios in plain English
- Include expected inputs and outputs
- Define verification criteria

### Phase 2: Generate Tests with AI
```
"Based on scenario/relational-db-processor.scenarios.md, 
 generate Playwright API tests for Scenarios 2, 3, and 4.
 Store them in tests/relational-db-processor.spec.ts"
```

### Phase 3: Review with Developers
- Share generated tests with your development team
- They can refine selectors and add edge cases
- Tests become part of CI/CD pipeline

### Phase 4: Maintain Scenarios
- When features change, update scenarios first
- Regenerate or update tests accordingly

---

## Quick Reference: Prompts That Work

### For API Tests (GraphQL)
```
"Generate a Playwright test that sends this GraphQL mutation 
 to localhost:4001/graphql and verifies the response:
 
 mutation { addDrive(name: 'test') { id name } }"
```

### For UI Tests
```
"Generate a Playwright test that:
 1. Goes to localhost:3000
 2. Clicks on 'Create New Drive'
 3. Fills in 'My Test Drive' as the name
 4. Clicks Submit
 5. Verifies the drive appears in the list"
```

### For Converting Scenarios
```
"Read scenarios/subgraphs.scenarios.md and generate 
 Playwright tests for all High priority scenarios.
 Use the API testing approach with the request fixture."
```

---

## Troubleshooting

### "Playwright MCP isn't working"
- Make sure the reactor is running: `ph reactor`
- Check the MCP is installed: `npx @playwright/mcp@latest --version`

### "Generated test has wrong selectors"
- Ask Claude to use more stable selectors (role, text, test-id)
- Share the actual HTML with Claude for better selectors

### "Test passes locally but fails in CI"
- Add explicit waits: `await page.waitForLoadState('networkidle')`
- Check for environment differences (ports, URLs)

---

## Resources

- [Playwright Documentation](https://playwright.dev/)
- [Playwright MCP GitHub](https://github.com/microsoft/playwright-mcp)
- [Your Scenario Templates](./scenarios/)

