import {
  expect,
  test,
  type Download,
  type Locator,
  type Page,
} from "@playwright/test";
import fs from "fs";
import JSZip from "jszip";
import path from "path";
import { fileURLToPath } from "url";
import {
  clickDocumentOperationHistory,
  closeDocumentFromToolbar,
  closeDocumentOperationHistory,
  createDocumentAndFillBasicData,
  goToConnectDrive,
  normalizeCode,
  verifyDocumentInList,
  type DocumentBasicData,
} from "./helpers/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DOCUMENT_MODEL_TYPE = "powerhouse/document-model";
const DOCUMENT_NAME = "ToDoDocument";
const EXPECTED_OPERATIONS = [
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
const EXPECTED_OPERATIONS_COUNT = EXPECTED_OPERATIONS.length;

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
  // Setup: Disable file picker for testing
  await page.addInitScript(() => {
    // @ts-expect-error - This is a test
    delete window.showSaveFilePicker;
  });

  // Create and setup document
  await setupDocument(page, TEST_DOCUMENT_DATA);

  // Verify document in list and open it
  await verifyDocumentInList(page, DOCUMENT_NAME, DOCUMENT_MODEL_TYPE);
  await page.getByText(DOCUMENT_NAME).click();

  // Verify all document aspects
  await verifyDocumentBasicData(page, TEST_DOCUMENT_DATA);
  await verifyDocumentInitialState(page);
  await verifyDocumentOperations(page, TEST_DOCUMENT_DATA);
  await verifyDocumentOperationHistory(page);

  // Export and validate document
  await exportAndValidateDocument(page);
});

// Helper Functions

async function setupDocument(
  page: Page,
  data: DocumentBasicData,
): Promise<void> {
  await goToConnectDrive(page, "My Local Drive");
  await createDocumentAndFillBasicData(page, DOCUMENT_NAME, data);
  await closeDocumentFromToolbar(page);
}

async function verifyDocumentBasicData(
  page: Page,
  data: DocumentBasicData,
): Promise<void> {
  const checks = [
    {
      selector: page.getByPlaceholder("Document Type"),
      value: data.documentType,
    },
    {
      selector: page.locator('textarea[name="authorName"]'),
      value: data.authorName,
    },
    {
      selector: page.locator('textarea[name="description"]').first(),
      value: data.description,
    },
    {
      selector: page.locator('textarea[name="authorWebsite"]'),
      value: data.authorWebsite,
    },
    {
      selector: page.locator('textarea[name="extension"]'),
      value: data.extension,
    },
  ];

  for (const check of checks) {
    await expect(check.selector).toHaveValue(check.value);
  }
}

async function verifyDocumentInitialState(page: Page): Promise<void> {
  const expectedInitialState =
    '{  "items": [],  "stats": {    "total": 0,    "checked": 0,    "unchecked": 0  }}';
  const initialState = await page.locator(".cm-content").nth(1).textContent();
  expect(initialState).toBe(expectedInitialState);
}

async function verifyDocumentOperations(
  page: Page,
  data: DocumentBasicData,
): Promise<void> {
  const operations = data.modules?.[0].operations || [];

  for (let i = 0; i < operations.length; i++) {
    const operationContent = await page
      .locator(".cm-content")
      .nth(i + 2)
      .textContent();
    expect(normalizeCode(operationContent)).toBe(
      normalizeCode(operations[i].schema),
    );
  }
}

async function verifyDocumentOperationHistory(page: Page): Promise<void> {
  await clickDocumentOperationHistory(page);

  const articles = await page
    .locator(
      ".flex.items-center.justify-between.rounded-xl.border.border-gray-200.bg-white.px-4.py-2",
    )
    .all();

  expect(articles).toHaveLength(EXPECTED_OPERATIONS_COUNT);
  await verifyOperationHistoryItems(articles, EXPECTED_OPERATIONS);
  await closeDocumentOperationHistory(page);
}

async function verifyOperationHistoryItems(
  articles: Locator[],
  expectedOperations: string[],
): Promise<void> {
  const articlesLength = articles.length;

  for (let index = 0; index < articles.length; index++) {
    const article = articles[index];
    const articleText = await article.textContent();

    expect(articleText).toContain(`Revision ${articlesLength - index}.`);
    expect(articleText).toContain(expectedOperations[index]);
    expect(articleText).toContain("No errors");
  }
}

async function exportAndValidateDocument(page: Page): Promise<void> {
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /export/i }).click();
  const download = await downloadPromise;

  const downloadPath = await saveDownloadedFile(download);
  await validateExportedZip(downloadPath);
}

async function saveDownloadedFile(download: Download): Promise<string> {
  const downloadsDir = path.join(__dirname, "../downloads");
  const customFilename = "todo.phdm.zip";
  const downloadPath = path.join(downloadsDir, customFilename);

  if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
  }

  await download.saveAs(downloadPath);
  expect(fs.existsSync(downloadPath)).toBeTruthy();
  console.log("File saved to:", downloadPath);

  return downloadPath;
}

async function validateExportedZip(downloadPath: string): Promise<void> {
  const zipBuffer = fs.readFileSync(downloadPath);
  const zip = await JSZip.loadAsync(zipBuffer);
  await validateZipContent(zip);
}

// Zip Validation Functions

async function validateZipContent(zip: JSZip): Promise<void> {
  const expectedFiles = [
    "header.json",
    "state.json",
    "current-state.json",
    "operations.json",
  ];

  verifyZipFilesExist(zip, expectedFiles);
  await validateZipFileContents(zip, expectedFiles);
}

function verifyZipFilesExist(zip: JSZip, expectedFiles: string[]): void {
  for (const filename of expectedFiles) {
    expect(zip.files[filename]).toBeTruthy();
    console.log(`✓ ${filename} exists in zip`);
  }
}

async function validateZipFileContents(
  zip: JSZip,
  filenames: string[],
): Promise<void> {
  const expectedDir = path.join(__dirname, "./expected-zip-content");

  for (const filename of filenames) {
    await validateJsonFile(zip, filename, expectedDir);
    console.log(`✓ ${filename} content validated`);
  }
}

async function validateJsonFile(
  zip: JSZip,
  filename: string,
  expectedDir: string,
): Promise<void> {
  const expectedContent = readExpectedFile(expectedDir, filename);
  const actualContent = await readZipFile(zip, filename);

  const cleanExpected = removeDynamicFields(JSON.parse(expectedContent));
  const cleanActual = removeDynamicFields(JSON.parse(actualContent));

  expect(cleanActual).toEqual(cleanExpected);
}

function readExpectedFile(expectedDir: string, filename: string): string {
  const expectedPath = path.join(expectedDir, filename);
  expect(fs.existsSync(expectedPath)).toBeTruthy();
  return fs.readFileSync(expectedPath, "utf8");
}

async function readZipFile(zip: JSZip, filename: string): Promise<string> {
  expect(zip.files[filename]).toBeTruthy();
  return await zip.files[filename].async("text");
}

function removeDynamicFields(obj: unknown): unknown {
  const dynamicFields = [
    "id",
    "slug",
    "created",
    "lastModified",
    "timestamp",
    "hash",
    "moduleId",
  ];

  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) {
    return obj.map((item: unknown) => removeDynamicFields(item));
  }

  const cleaned: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (dynamicFields.includes(key)) {
      continue;
    }
    cleaned[key] = removeDynamicFields(value);
  }

  return cleaned;
}
