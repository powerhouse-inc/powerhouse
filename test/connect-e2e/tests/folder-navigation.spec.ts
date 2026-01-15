import {
  clickDocumentOperationHistory,
  closeDocumentFromToolbar,
  closeDocumentOperationHistory,
  createFolder,
  deleteFolder,
  duplicateFolder,
  goToConnectDrive,
  navigateBackAndVerify,
  navigateIntoFolder,
  renameFolder,
} from "@powerhousedao/e2e-utils";
import { createDocument } from "./helpers/document.js";
import { expect, test } from "./helpers/fixtures.js";

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

test("Navigate to local drive", async ({ page }) => {
  await goToConnectDrive(page, "My Local Drive");
});

test("Create new folder and verify it exists", async ({ page }) => {
  await goToConnectDrive(page, "My Local Drive");
  await createFolder(page, "test folder", "My Local Drive");
});

test("Rename folder and verify new name", async ({ page }) => {
  await goToConnectDrive(page, "My Local Drive");
  await createFolder(page, "test folder", "My Local Drive");
  await renameFolder(page, "test folder", "my-documents");
});

test("Duplicate folder and verify copy exists", async ({ page }) => {
  await goToConnectDrive(page, "My Local Drive");
  await createFolder(page, "test folder", "My Local Drive");
  await duplicateFolder(page, "test folder");
});

test("Delete folder and verify it is removed", async ({ page }) => {
  await goToConnectDrive(page, "My Local Drive");
  await createFolder(page, "test folder", "My Local Drive");
  await deleteFolder(page, "test folder");
});

test("Navigate through nested folders and verify breadcrumbs", async ({
  page,
}) => {
  await goToConnectDrive(page, "My Local Drive");

  // Create and navigate through nested folders
  await createFolder(page, "parent", "My Local Drive");
  await navigateIntoFolder(page, "parent");

  await createFolder(page, "children1", "parent");
  await navigateIntoFolder(page, "children1");

  await createFolder(page, "children2", "children1");
  await navigateIntoFolder(page, "children2");

  await createFolder(page, "children3", "children2");
  await page.getByText("children3").waitFor({ state: "visible" });

  // Navigate back using breadcrumbs and verify each level
  await navigateBackAndVerify(page, "children3", "children2");
  await navigateBackAndVerify(page, "children2", "children1");
  await navigateBackAndVerify(page, "children1", "parent");
  await navigateBackAndVerify(page, "parent", "My Local Drive");
});

test("Create Document Model", async ({ page }) => {
  await goToConnectDrive(page, "My Local Drive");
  await createDocument(page, "DocumentModel", "MyDocumentModel");
  await closeDocumentFromToolbar(page);

  // Verify document appears in the list with correct name and type
  await expect(page.locator("text=MyDocumentModel")).toBeVisible();
  await expect(page.locator("text=powerhouse/document-model")).toBeVisible();
});

test("Document Operation History", async ({ page }) => {
  await goToConnectDrive(page, "My Local Drive");
  await createDocument(page, "DocumentModel", "MyDocumentModel");
  // wait for 2 seconds
  await page.waitForTimeout(1000);
  await clickDocumentOperationHistory(page);
  const articles = await page
    .locator(
      ".flex.items-center.justify-between.rounded-xl.border.border-gray-200.bg-white.px-4.py-2",
    )
    .all();

  const articlesLength = articles.length;
  expect(articles).toHaveLength(3);

  const expectedOperations = [
    "SET_INITIAL_STATE",
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
