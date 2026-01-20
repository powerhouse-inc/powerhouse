import type { Page } from "@playwright/test";
import fs from "fs";
import path from "path";
import type { DocumentBasicData } from "@powerhousedao/e2e-utils/types";
import { closeDocumentFromToolbar } from "@powerhousedao/e2e-utils";
import {
  createDocumentAndFillBasicData,
  navigateToVetraDrive,
} from "./helpers/document.js";
import { expect, test } from "./helpers/fixtures.js";

// Run serially to avoid conflicts with other tests that modify the shared Vetra drive
test.describe.configure({ mode: "serial" });

const DOCUMENT_NAME = "ToDoDocument";

const TEST_DOCUMENT_DATA: DocumentBasicData = {
  documentType: "powerhouse/todo",
  authorName: "Powerhouse",
  description: "ToDo Document Model",
  authorWebsite: "https://www.powerhouse.inc",
  extension: ".phdm",
  global: {
    schema:
      "type ToDoDocumentState {\n  items: [ToDoItem!]!\n  stats: ToDoListStats!\n}\n\ntype ToDoItem {\n  id: ID!\n  text: String!\n  checked: Boolean!\n}\n\ntype ToDoListStats {\n  total: Int!\n  checked: Int!\n  unchecked: Int!\n}",
    initialState:
      '{\n  "items": [],\n  "stats": {\n    "total": 0,\n    "checked": 0,\n    "unchecked": 0\n  }\n}',
  },
  modules: [
    {
      name: "base_operations",
      operations: [
        {
          name: "add todo item input",
          schema:
            "input AddTodoItemInputInput {\n  id: ID!\n  text: String!\n}",
        },
        {
          name: "update todo item input",
          schema:
            "input UpdateTodoItemInputInput {\n  id: ID!\n  text: String\n  checked: Boolean\n}",
        },
        {
          name: "delete todo item input",
          schema: "input DeleteTodoItemInputInput {\n  id: ID!\n}",
        },
      ],
    },
  ],
};

// Use clean storage state for each test to ensure no documents persist from previous runs
test.use({
  storageState: {
    cookies: [],
    origins: [
      {
        origin: "http://localhost:3001",
        localStorage: [
          { name: "/:display-cookie-banner", value: "false" },
          {
            name: "/:acceptedCookies",
            value: '{"analytics":true,"marketing":false,"functional":false}',
          },
        ],
      },
    ],
  },
});

test("Create ToDoDocument Model", async ({ page }) => {
  // Create and setup document
  await setupDocument(page, TEST_DOCUMENT_DATA);
});

// Helper Functions

async function setupDocument(
  page: Page,
  data: DocumentBasicData,
): Promise<void> {
  await navigateToVetraDrive(page);
  await createDocumentAndFillBasicData(page, DOCUMENT_NAME, data);

  // Wait for code generation to complete by waiting for network idle
  // and giving the codegen processor time to write files
  await page.waitForLoadState("networkidle");

  // Poll for the generated files with a timeout
  // We need to wait for the full code generation including index.ts update
  const maxWaitMs = 60000;
  const startTime = Date.now();
  const documentModelsDir = path.join(process.cwd(), "document-models");
  const todoDocModelDir = path.join(documentModelsDir, "to-do-document");
  const documentModelsIndex = path.join(documentModelsDir, "index.ts");
  const expectedExport =
    'export { ToDoDocument } from "./to-do-document/module.js"';

  // Wait for the index.ts file to contain the expected export
  // This is more reliable than just waiting for the directory to exist
  // because the code generation uses debouncing
  let foundExport = false;
  while (Date.now() - startTime < maxWaitMs) {
    if (fs.existsSync(documentModelsIndex) && fs.existsSync(todoDocModelDir)) {
      const indexContent = fs.readFileSync(documentModelsIndex, "utf-8");
      if (indexContent.includes(expectedExport)) {
        foundExport = true;
        break;
      }
    }
    await page.waitForTimeout(500);
  }

  // Verify document model folder was created
  expect(fs.existsSync(todoDocModelDir)).toBe(true);

  // Verify export was added to document-models/index.ts
  const docModelsIndexContent = fs.readFileSync(documentModelsIndex, "utf-8");
  expect(docModelsIndexContent).toContain(expectedExport);

  // Note: Automatic subgraph generation for document models was disabled
  // in commit d705e0c5f. Subgraphs are now generated separately via
  // the powerhouse/subgraph document type.

  await closeDocumentFromToolbar(page);
}
