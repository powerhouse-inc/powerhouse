import type { Download, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import {
  clickDocumentOperationHistory,
  closeDocumentFromToolbar,
  closeDocumentOperationHistory,
  goToConnectDrive,
  normalizeCode,
  openDocumentByName,
  verifyDocumentInList,
} from "@powerhousedao/e2e-utils";
import type { DocumentBasicData } from "@powerhousedao/e2e-utils/types";
import fs from "fs";
import JSZip from "jszip";
import path from "path";
import { fileURLToPath } from "url";
import {
  createDocument,
  createDocumentAndFillBasicData,
} from "./helpers/document.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DOCUMENT_MODEL_TYPE = "powerhouse/document-model";
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

test("Create ToDoDocument Model", async ({ page }) => {
  // Setup: Disable file picker for testing
  await page.addInitScript(() => {
    // @ts-expect-error - This is a test
    delete window.showSaveFilePicker;
  });

  // Create and setup document
  await setupDocument(page, TEST_DOCUMENT_DATA);

  // Verify document in list and open it
  await verifyDocumentInList(page, DOCUMENT_NAME, DOCUMENT_MODEL_TYPE);
  await openDocumentByName(page, DOCUMENT_NAME);

  // Verify all document aspects
  await verifyDocumentBasicData(page, TEST_DOCUMENT_DATA);
  await verifyDocumentInitialState(page);
  await verifyDocumentOperations(page, TEST_DOCUMENT_DATA);
  await verifyDocumentOperationHistory(page);

  // Export and validate document
  await exportAndValidateDocument(page);
});

test("Create a TodoList", async ({ page }) => {
  await goToConnectDrive(page, "My Local Drive");
  await createDocument(page, "ToDoDocument", "MyTodoList");
  // Wait for the editor to load - look for the "Document State" heading which indicates the editor has rendered
  await page
    .getByRole("heading", { name: "Document State" })
    .waitFor({ state: "visible" });
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
  // Use toContain instead of toBe as the editor may include local state placeholder
  expect(initialState).toContain(expectedInitialState);
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

  // Verify we have at least one operation
  expect(articles.length).toBeGreaterThan(0);

  // Verify each operation has no errors
  for (const article of articles) {
    const articleText = await article.textContent();
    expect(articleText).toContain("No errors");
  }

  await closeDocumentOperationHistory(page);
}

async function exportAndValidateDocument(page: Page): Promise<void> {
  // Set up download listener before clicking anything
  const downloadPromise = page.waitForEvent("download", { timeout: 30000 });

  // Click the Export button in the toolbar
  await page
    .getByRole("button", { name: /export/i })
    .first()
    .click();

  // Check if an error dialog appears and handle it
  const errorDialog = page.getByRole("dialog", {
    name: "Your document contains errors",
  });
  const dialogVisible = await errorDialog.isVisible().catch(() => false);

  if (dialogVisible) {
    // Click the Export button inside the dialog to proceed despite errors
    await errorDialog.getByRole("button", { name: "Export" }).click();
  } else {
    // Wait a bit and check again (dialog might take time to appear)
    await page.waitForTimeout(500);
    if (await errorDialog.isVisible().catch(() => false)) {
      await errorDialog.getByRole("button", { name: "Export" }).click();
    }
  }

  // Wait for download to complete
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

  // Only validate state files - operations.json varies due to debouncing and timing
  const filesToValidate = ["header.json", "state.json", "current-state.json"];
  await validateZipFileContents(zip, filesToValidate);
}

function verifyZipFilesExist(zip: JSZip, expectedFiles: string[]): void {
  for (const filename of expectedFiles) {
    expect(zip.files[filename]).toBeTruthy();
  }
}

async function validateZipFileContents(
  zip: JSZip,
  filenames: string[],
): Promise<void> {
  const expectedDir = path.join(__dirname, "./expected-zip-content");

  for (const filename of filenames) {
    await validateJsonFile(zip, filename, expectedDir);
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
    "createdAtUtcIso",
    "lastModifiedAtUtcIso",
    "timestampUtcMs",
    "documentId",
    // Signature and context fields that change between runs
    "signer",
    "context",
    "signatures",
    "sig",
    "nonce",
    "publicKey",
    // Revision fields that vary based on operation count
    "revision",
    // Placeholder fields from local state
    "_placeholder",
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
