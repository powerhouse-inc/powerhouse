import { expect, test } from "@playwright/test";
import {
  clickDocumentOperationHistory,
  closeDocumentFromToolbar,
  closeDocumentOperationHistory,
  createDocumentAndFillBasicData,
  goToConnectDrive,
  normalizeCode,
  type DocumentBasicData,
} from "./helpers/index.js";

test.use({
  storageState: {
    cookies: [],
    origins: [
      {
        origin: "http://127.0.0.1:3000",
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

test("Create ToDoDocument", async ({ page }) => {
  const data: DocumentBasicData = {
    documentType: "powerhouse/todo",
    authorName: "Powerhouse",
    description: "ToDo Document Model",
    authorWebsite: "https://www.powerhouse.inc",
    extension: ".phdm",
    schema:
      "type ToDoDocumentState {\n  items: [ToDoItem!]!\n  stats: ToDoListStats!\n}\n\n# Defines a GraphQL type for a single to-do item\ntype ToDoItem {\n  id: ID! # Unique identifier for each to-do item\n  text: String! # The text description of the to-do item\n  checked: Boolean! # Status of the to-do item (checked/unchecked)\n}\n\n# Defines a GraphQL type for the statistics of the to-do list\ntype ToDoListStats {\n  total: Int! # Total number of items\n  checked: Int! # Number of checked items\n  unchecked: Int! # Number of unchecked items\n}",
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

  await goToConnectDrive(page, "My Local Drive");
  await createDocumentAndFillBasicData(page, "ToDoDocument", data);
  // Close document
  await closeDocumentFromToolbar(page);

  // Verify document appears in the list with correct name and type
  await expect(page.locator("text=ToDoDocument")).toBeVisible();
  await expect(page.locator("text=powerhouse/document-model")).toBeVisible();

  await page.getByText("ToDoDocument").click();

  // Verify basic document data
  await expect(page.getByPlaceholder("Document Type")).toHaveValue(
    data.documentType,
  );
  await expect(page.locator('textarea[name="authorName"]')).toHaveValue(
    data.authorName,
  );
  await expect(
    page.locator('textarea[name="description"]').first(),
  ).toHaveValue(data.description);
  await expect(page.locator('textarea[name="authorWebsite"]')).toHaveValue(
    data.authorWebsite,
  );
  await expect(page.locator('textarea[name="extension"]')).toHaveValue(
    data.extension,
  );

  // Verify initial state
  const initialState = await page.locator(".cm-content").nth(1).textContent();
  expect(initialState).toBe(
    '{  "items": [],  "stats": {    "total": 0,    "checked": 0,    "unchecked": 0  }}',
  );

  // Verify operations
  const addTodoItemInput = await page
    .locator(".cm-content")
    .nth(2)
    .textContent();

  expect(normalizeCode(addTodoItemInput)).toBe(
    normalizeCode(data.modules?.[0].operations[0].schema),
  );

  const updateTodoItemInput = await page
    .locator(".cm-content")
    .nth(3)
    .textContent();
  expect(normalizeCode(updateTodoItemInput)).toBe(
    normalizeCode(data.modules?.[0].operations[1].schema),
  );

  const deleteTodoItemInput = await page
    .locator(".cm-content")
    .nth(4)
    .textContent();
  expect(normalizeCode(deleteTodoItemInput)).toBe(
    normalizeCode(data.modules?.[0].operations[2].schema),
  );

  // Verify document operation history
  await clickDocumentOperationHistory(page);
  const articles = await page
    .locator(
      ".flex.items-center.justify-between.rounded-xl.border.border-gray-200.bg-white.px-4.py-2",
    )
    .all();

  const articlesLength = articles.length;
  expect(articles).toHaveLength(23);

  const expectedOperations = [
    "SET_OPERATION_SCHEMA",
    "SET_OPERATION_SCHEMA",
    "SET_OPERATION_SCHEMA",
    "ADD_OPERATION",
    "SET_OPERATION_SCHEMA",
    "SET_OPERATION_SCHEMA",
    "SET_OPERATION_SCHEMA",
    "ADD_OPERATION",
    "SET_OPERATION_SCHEMA",
    "SET_OPERATION_SCHEMA",
    "SET_OPERATION_SCHEMA",
    "ADD_OPERATION",
    "ADD_MODULE",
    "SET_INITIAL_STATE",
    "SET_STATE_SCHEMA",
    "SET_STATE_SCHEMA",
    "SET_MODEL_EXTENSION",
    "SET_AUTHOR_WEBSITE",
    "SET_MODEL_DESCRIPTION",
    "SET_AUTHOR_NAME",
    "SET_MODEL_ID",
    "SET_STATE_SCHEMA",
    "SET_MODEL_NAME",
  ];

  let index = 0;

  for (const article of articles) {
    const articleText = await article.textContent();
    expect(articleText).toContain(`Revision ${articlesLength - index}.`);
    expect(articleText).toContain(expectedOperations[index]);
    expect(articleText).toContain("No errors");
    index++;
  }

  await closeDocumentOperationHistory(page);
});
