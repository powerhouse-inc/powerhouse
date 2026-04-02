import type { Page } from "@playwright/test";
import type { ChildProcess } from "child_process";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import type { DocumentBasicData } from "@powerhousedao/e2e-utils/types";
import {
  createDocument,
  createDocumentAndFillBasicData,
  navigateToVetraDrive,
} from "./helpers/document.js";
import { expect, test } from "./helpers/fixtures.js";
import {
  CONSUMER_CONNECT_URL,
  buildConsumerConnect,
  cleanupConsumerBuildArtifacts,
  ensureConsumerProject,
  installConsumerDeps,
  startConsumerPreview,
  stopConsumerPreview,
} from "./helpers/consumer-project.js";
import {
  REGISTRY_URL,
  createTestUser,
  startRegistry,
  stopRegistry,
  verifyPublish,
  writeNpmrc,
} from "./helpers/registry.js";

// Run serially to avoid conflicts with other tests that modify the shared Vetra drive
test.describe.configure({ mode: "serial", timeout: 5 * 60 * 60 * 1000 });
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

// Module-level state shared across serial tests
let registryProcess: ChildProcess | undefined;
let consumerPreviewProcess: ChildProcess | undefined;

test.afterAll(async () => {
  if (consumerPreviewProcess) {
    stopConsumerPreview(consumerPreviewProcess);
    consumerPreviewProcess = undefined;
  }
  if (registryProcess) {
    stopRegistry(registryProcess);
    registryProcess = undefined;
  }
  cleanupConsumerBuildArtifacts();
});

test("Create ToDoDocument Model", async ({ page }) => {
  test.setTimeout(120_000);
  await setupDocument(page, TEST_DOCUMENT_DATA);
});

test("Create ToDoDocument Editor", async ({ page }) => {
  test.setTimeout(120_000);

  await navigateToVetraDrive(page);

  // Create a document-editor document
  await createDocument(page, "powerhouse/document-editor", "ToDoEditor");

  // Wait for the editor form to load
  await page.waitForLoadState("networkidle");

  // Fill in the editor name
  const editorNameInput = page.locator("input#editor-name");
  await expect(editorNameInput).toBeVisible({ timeout: 30_000 });
  await editorNameInput.fill("ToDoEditor");

  // Select the document type from the dropdown
  const documentTypesSelect = page.locator("select#supported-document-types");
  await expect(documentTypesSelect).toBeVisible({ timeout: 30_000 });

  // Wait for the dropdown to contain the powerhouse/todo option
  // (populated asynchronously from the drive's document models)
  const maxWaitMs = 60_000;
  const startTime = Date.now();
  let optionFound = false;
  while (Date.now() - startTime < maxWaitMs) {
    const options = await documentTypesSelect
      .locator("option")
      .allTextContents();
    if (options.some((opt) => opt.includes("powerhouse/todo"))) {
      optionFound = true;
      break;
    }
    await page.waitForTimeout(500);
  }
  expect(optionFound).toBe(true);

  await documentTypesSelect.selectOption({ label: "powerhouse/todo" });

  // Click the Confirm button to trigger codegen
  const confirmButton = page.getByRole("button", { name: "Confirm" });
  await expect(confirmButton).toBeEnabled({ timeout: 10_000 });
  await confirmButton.click();

  // Wait for code generation to complete
  await page.waitForLoadState("networkidle");

  // Poll for the generated editor files by waiting for editors/index.ts to be
  // updated with a real export (not just "export {};")
  const editorsDir = path.join(process.cwd(), "editors");
  const editorsIndex = path.join(editorsDir, "index.ts");
  const pollStart = Date.now();

  let editorGenComplete = false;
  while (Date.now() - pollStart < maxWaitMs) {
    if (fs.existsSync(editorsIndex)) {
      const indexContent = fs.readFileSync(editorsIndex, "utf-8");
      if (
        indexContent.trim() !== "export {};" &&
        indexContent.includes("export")
      ) {
        const entries = fs.readdirSync(editorsDir, { withFileTypes: true });
        const subdirs = entries.filter((e) => e.isDirectory());
        if (subdirs.length > 0) {
          editorGenComplete = true;
          break;
        }
      }
    }
    await page.waitForTimeout(500);
  }

  expect(editorGenComplete).toBe(true);
});

test("Build and Publish to Registry", async () => {
  test.setTimeout(180_000);

  const testDir = process.cwd();
  const registryStoragePath = path.join(testDir, ".registry-storage");
  const registryCdnCachePath = path.join(testDir, ".registry-cdn-cache");

  // Start the registry (kept running for the next test)
  registryProcess = await startRegistry(
    registryStoragePath,
    registryCdnCachePath,
  );

  // Create test user and write .npmrc for auth
  const token = await createTestUser();
  writeNpmrc(testDir, token);

  // Ensure the manifest has the package name set (codegen populates
  // documentModels/editors but not the name field)
  const manifestPath = path.join(testDir, "powerhouse.manifest.json");
  const currentManifest = JSON.parse(
    fs.readFileSync(manifestPath, "utf-8"),
  ) as {
    name: string;
  };
  currentManifest.name = "test-package-vetra";
  fs.writeFileSync(manifestPath, JSON.stringify(currentManifest, null, 4));

  // Also update package.json name so npm publish uses the correct name
  const packageJsonPath = path.join(testDir, "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8")) as {
    name: string;
  };
  packageJson.name = "test-package-vetra";
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

  // Build the package with ph-cli build
  console.log("Building package with ph-cli build...");
  execSync("pnpm build", {
    cwd: testDir,
    stdio: "pipe",
    timeout: 120_000,
  });

  // Verify dist/ was created
  const distDir = path.join(testDir, "dist");
  expect(fs.existsSync(distDir)).toBe(true);

  const distManifest = path.join(distDir, "powerhouse.manifest.json");
  expect(fs.existsSync(distManifest)).toBe(true);

  const manifest = JSON.parse(fs.readFileSync(distManifest, "utf-8")) as {
    documentModels: unknown[];
    editors: unknown[];
  };
  expect(manifest.documentModels.length).toBeGreaterThan(0);
  expect(manifest.editors.length).toBeGreaterThan(0);

  // Publish to the local registry
  // In Docker, ph-cli can't connect to [::1] URLs, so use the socat IPv4 bridge on port 18080
  const publishRegistryUrl = process.env.DOCKER_E2E
    ? "http://localhost:18080"
    : REGISTRY_URL;
  console.log(
    `Publishing package to local registry (${publishRegistryUrl})...`,
  );
  execSync(`pnpm exec ph-cli publish --registry=${publishRegistryUrl}`, {
    cwd: testDir,
    stdio: "pipe",
    timeout: 60_000,
  });

  // Verify the package was published
  const maxWaitMs = 30_000;
  const startTime = Date.now();
  let published = false;
  while (Date.now() - startTime < maxWaitMs) {
    try {
      await verifyPublish("test-package-vetra");
      published = true;
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  expect(published).toBe(true);

  // Verify package is served via CDN (extraction is async, so poll)
  let cdnVerified = false;
  const cdnPollStart = Date.now();
  while (Date.now() - cdnPollStart < maxWaitMs) {
    try {
      const cdnRes = await fetch(
        `${REGISTRY_URL}/-/cdn/test-package-vetra/powerhouse.manifest.json`,
      );
      if (cdnRes.ok) {
        const cdnManifest = (await cdnRes.json()) as {
          documentModels: unknown[];
          editors: unknown[];
        };
        if (
          cdnManifest.documentModels?.length > 0 &&
          cdnManifest.editors?.length > 0
        ) {
          cdnVerified = true;
          break;
        }
      }
    } catch {
      // CDN not ready yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  expect(cdnVerified).toBe(true);
});

test("Install Package in Consumer Project", async ({ browser }) => {
  test.setTimeout(10 * 60 * 1000); // 10 minutes for build + preview + UI

  // Ensure consumer project exists (creates it via ph init in Docker mode)
  ensureConsumerProject();

  // Step 1: Install dependencies for the consumer project
  installConsumerDeps();

  // Step 2: Build Connect
  buildConsumerConnect();

  // Step 3: Start Connect preview
  consumerPreviewProcess = await startConsumerPreview();

  // Step 5: Open a new browser context pointing to the consumer Connect
  const context = await browser.newContext({
    storageState: {
      cookies: [],
      origins: [
        {
          origin: CONSUMER_CONNECT_URL,
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
  const page = await context.newPage();

  try {
    // Navigate to the consumer Connect
    await page.goto(CONSUMER_CONNECT_URL);
    await page.waitForLoadState("networkidle");

    // Wait for the app to fully load (skeleton loader disappears)
    await page
      .locator(".skeleton-loader")
      .waitFor({ state: "hidden", timeout: 60_000 });

    // Step 6: Open Settings modal
    const settingsButton = page.locator('button[aria-label="Settings"]');
    await expect(settingsButton).toBeVisible({ timeout: 30_000 });
    await settingsButton.click();

    // Wait for settings modal to appear
    const settingsModal = page.getByRole("dialog");
    await expect(settingsModal).toBeVisible({ timeout: 10_000 });

    // Package Manager tab is selected by default — verify it's showing
    const installHeading = page.getByText("Install Package");
    await expect(installHeading).toBeVisible({ timeout: 10_000 });

    // Step 7: Install the package using the search autocomplete
    const searchInput = page.locator('input[placeholder="Search packages..."]');
    await expect(searchInput).toBeVisible({ timeout: 10_000 });

    // Type slowly to trigger the debounced search
    await searchInput.click();
    await searchInput.fill("test-package");

    // Wait for the autocomplete popover to show results
    // The popover content appears inside a [data-radix-popper-content-wrapper]
    const popoverResult = page.locator("text=test-package-vetra").first();
    await expect(popoverResult).toBeVisible({ timeout: 30_000 });

    // Click the Install button next to the result inside the popover
    const installButton = page
      .locator("div")
      .filter({ hasText: "test-package-vetra" })
      .getByRole("button", { name: "Install" });
    await expect(installButton).toBeVisible({ timeout: 5_000 });
    await installButton.click();

    // Wait for installation to complete
    await page.waitForTimeout(5000);

    // Step 8: Close the settings modal
    const closeButton = settingsModal
      .locator("button")
      .filter({ has: page.locator("svg") })
      .first();
    await closeButton.click();
    await settingsModal.waitFor({ state: "hidden", timeout: 10_000 });

    // Step 9: Create a new local drive
    const createDriveButton = page.getByText("Create New Drive");
    await expect(createDriveButton).toBeVisible({ timeout: 10_000 });
    await createDriveButton.click();

    // Wait for the add drive dialog
    const addDriveDialog = page.getByRole("dialog");
    await expect(addDriveDialog).toBeVisible({ timeout: 10_000 });

    // Fill in drive name
    const driveNameInput = page.locator('input[placeholder="Drive name"]');
    await expect(driveNameInput).toBeVisible({ timeout: 5_000 });
    await driveNameInput.fill("Test Drive");

    // Click Create
    const createDriveSubmit = page.getByRole("button", {
      name: "Create new drive",
    });
    await expect(createDriveSubmit).toBeEnabled({ timeout: 5_000 });
    await createDriveSubmit.click();

    // Wait for drive to be created
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Step 10: Navigate into the drive by clicking on it
    const driveCard = page.getByRole("heading", {
      name: "Test Drive",
      level: 3,
    });
    await expect(driveCard).toBeVisible({ timeout: 10_000 });
    await driveCard.click();
    await page.waitForLoadState("networkidle");

    // Step 11: Create a document of the installed package type
    // In Connect, installed document types appear as buttons in "New document" section
    // The ToDoDocument from our published package shows as "ToDoDocument v1"
    const addDocButton = page
      .getByRole("button")
      .filter({ hasText: "ToDoDocument" });
    await expect(addDocButton).toBeVisible({ timeout: 30_000 });
    await addDocButton.click();

    // Fill in document name in the create document dialog
    const docNameInput = page.locator('input[placeholder="Document name"]');
    await expect(docNameInput).toBeVisible({ timeout: 10_000 });
    await docNameInput.fill("TestTodoDoc");

    const createDocButton = page.getByRole("button", { name: "Create" });
    await expect(createDocButton).toBeEnabled({ timeout: 5_000 });
    await createDocButton.click();

    // Wait for document to be created and editor to load
    await page.waitForLoadState("networkidle");

    // Step 12: Verify the document was created and the editor loaded
    // The URL should contain a document path
    expect(page.url()).toContain("/d/");

    // Verify the page has meaningful content (editor rendered)
    const docHeading = page.getByRole("heading", { name: "TestTodoDoc" });
    await expect(docHeading).toBeVisible({ timeout: 30_000 });
  } finally {
    await context.close();
  }
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
    'export { ToDoDocument as ToDoDocumentV1 } from "./to-do-document/v1/module.js"';

  while (Date.now() - startTime < maxWaitMs) {
    if (fs.existsSync(documentModelsIndex) && fs.existsSync(todoDocModelDir)) {
      const indexContent = fs.readFileSync(documentModelsIndex, "utf-8");
      if (indexContent.includes(expectedExport)) {
        break;
      }
    }
    await page.waitForTimeout(500);
  }

  expect(fs.existsSync(todoDocModelDir)).toBe(true);

  const docModelsIndexContent = fs.readFileSync(documentModelsIndex, "utf-8");
  expect(docModelsIndexContent).toContain(expectedExport);
}
