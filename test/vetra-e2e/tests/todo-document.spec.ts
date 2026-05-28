import type { BrowserContext, Page } from "@playwright/test";
import type { ChildProcess } from "child_process";
import { execSync, spawn } from "child_process";
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
  getConsumerProjectPath,
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
} from "@powerhousedao/e2e-utils";

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
// The "Install Package in Consumer Project" test hands its browser context off
// to the next test ("Change registry URL at runtime ...") so the second test
// can continue inside the same Connect session (installed package, drive, etc.).
// Closed by afterAll, not by the test that creates it.
let consumerContext: BrowserContext | undefined;
let consumerPage: Page | undefined;

// Constants for the second registry started by the runtime-config-change test.
// We can't reuse the e2e-utils REGISTRY_PORT (8080) because the whole point of
// the test is to prove a port change is picked up at runtime; we also need a
// dedicated storage + cdn cache directory to keep the two registries isolated.
const NEW_REGISTRY_PORT = 8081;
const NEW_REGISTRY_URL = `http://localhost:${NEW_REGISTRY_PORT}`;

test.afterAll(async () => {
  if (consumerContext) {
    try {
      await consumerContext.close();
    } catch {
      // already closed
    }
    consumerContext = undefined;
    consumerPage = undefined;
  }
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

// ----------------------------------------------------------------------
// Restart the registry on a different port while keeping the original
// storage + cdn cache directories. The previously-published
// test-package-vetra stays available on the new port without a republish
// — exactly the "operator changes the registry URL at runtime" scenario
// the runtime-config test exercises.
// ----------------------------------------------------------------------

async function restartRegistryOnPort(
  port: number,
  storagePath: string,
  cdnCachePath: string,
): Promise<ChildProcess> {
  // Deliberately do NOT wipe the storage / cdn cache directories — we want
  // the previous publish to remain visible after the port switch.
  const child = spawn(
    "pnpm",
    [
      "exec",
      "ph-registry",
      "--port",
      String(port),
      "--storage-dir",
      storagePath,
      "--cdn-cache-dir",
      cdnCachePath,
    ],
    { stdio: "pipe", detached: false },
  );

  child.stdout?.on("data", (d: Buffer) =>
    console.log(`[registry:${port}] ${d.toString().trim()}`),
  );
  child.stderr?.on("data", (d: Buffer) =>
    console.error(`[registry:${port}:err] ${d.toString().trim()}`),
  );

  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `Registry on :${port} exited with code ${child.exitCode}`,
      );
    }
    try {
      const res = await fetch(`http://localhost:${port}/-/ping`);
      if (res.ok) {
        console.log(`[registry] ready on :${port}`);
        return child;
      }
    } catch {
      // not ready
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  child.kill();
  throw new Error(`Registry on :${port} did not start within 30s`);
}

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
  console.log("Publishing package to local registry...");
  execSync("pnpm exec ph-cli publish", {
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

    // Step 7: Install the package using the search autocomplete.
    // Match the placeholder by prefix so the test keeps passing when the
    // hint text is extended (e.g. to document name@tag / name@version
    // support).
    const searchInput = page.locator('input[placeholder^="Search packages"]');
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

    // Hand the context off to the next serial test so it can continue inside
    // the same Connect session (installed package, drive, etc.). afterAll
    // closes both.
    consumerContext = context;
    consumerPage = page;
  } catch (err) {
    // Only close on failure so the next test still has a working session.
    await context.close();
    throw err;
  }
});

test("Change registry URL at runtime and install from new registry", async () => {
  test.setTimeout(10 * 60 * 1000); // 10 minutes for republish + UI flow

  // Continuation of the previous test — reuse its browser context so the
  // already-installed test-package-vetra (from the previous test) is present
  // in localStorage. We uninstall it via the UI first, then point the runtime
  // config at a fresh registry on a different port and install again.
  if (!consumerPage || !consumerContext) {
    throw new Error(
      "Consumer browser session not initialised — previous test must have failed",
    );
  }
  const page = consumerPage;

  // -------------------------------------------------------------------
  // Step 1: Uninstall test-package-vetra via the Package Manager UI
  // -------------------------------------------------------------------
  console.log("Uninstalling test-package-vetra via the Package Manager UI...");

  const settingsButton = page.locator('button[aria-label="Settings"]');
  await expect(settingsButton).toBeVisible({ timeout: 30_000 });
  await settingsButton.click();

  const settingsModal = page.getByRole("dialog");
  await expect(settingsModal).toBeVisible({ timeout: 10_000 });

  // The "Installed Packages" section is a collapsible PackageSection; it
  // starts collapsed so the row isn't in the DOM yet. Click the section
  // header to expand before looking for the row.
  const installedSectionToggle = settingsModal
    .getByRole("button", { name: /^Installed Packages/i });
  await expect(installedSectionToggle).toBeVisible({ timeout: 10_000 });
  await installedSectionToggle.click();

  // Find the installed package row by its <h3>name and open its dropdown.
  const installedRow = settingsModal
    .locator("li")
    .filter({ has: page.locator('h3:has-text("test-package-vetra")') });
  await expect(installedRow).toBeVisible({ timeout: 30_000 });

  // The 3-dot menu button is the only <button> on the row; the dropdown
  // emits a "Uninstall" menu item once open.
  const rowDotsButton = installedRow.locator("button").first();
  await rowDotsButton.click();
  const uninstallMenuItem = page.getByText("Uninstall", { exact: true });
  await expect(uninstallMenuItem).toBeVisible({ timeout: 10_000 });
  await uninstallMenuItem.click();

  // Toast confirms the BrowserPackageManager.removePackage() cleared the
  // localStorage entry — without this clean state, a subsequent boot under a
  // different registry URL would attempt to re-hydrate the old install and
  // 404 against the dead URL.
  await expect(page.getByText(/uninstalled successfully/i)).toBeVisible({
    timeout: 10_000,
  });

  // Close the settings modal so it doesn't capture later clicks.
  const closeSettings = async () => {
    const closeBtn = settingsModal
      .locator("button")
      .filter({ has: page.locator("svg") })
      .first();
    await closeBtn.click();
    await settingsModal.waitFor({ state: "hidden", timeout: 10_000 });
  };
  await closeSettings();

  // -------------------------------------------------------------------
  // Step 2: Stop the registry on :8080 and restart it on :8081 using the
  //         SAME storage + cdn cache directories so the package published
  //         in the previous test is still available on the new port. No
  //         republish needed — this is just an operator-facing URL change.
  // -------------------------------------------------------------------
  console.log("Stopping registry on :8080...");
  const testDir = process.cwd();
  const registryStoragePath = path.join(testDir, ".registry-storage");
  const registryCdnCachePath = path.join(testDir, ".registry-cdn-cache");
  if (registryProcess) {
    stopRegistry(registryProcess);
    registryProcess = undefined;
  }
  // Give the registry process a moment to release the port + flush.
  await new Promise((r) => setTimeout(r, 1000));

  console.log(`Restarting registry on :${NEW_REGISTRY_PORT} (same storage)...`);
  registryProcess = await restartRegistryOnPort(
    NEW_REGISTRY_PORT,
    registryStoragePath,
    registryCdnCachePath,
  );

  // -------------------------------------------------------------------
  // Step 4a: Edit consumer's dist powerhouse.config.json at runtime
  // -------------------------------------------------------------------
  // The preview server is static (vite preview); a browser refresh re-reads
  // the file from disk, so changing it here is enough — no server restart.
  console.log(
    `Editing consumer dist powerhouse.config.json → packageRegistryUrl=${NEW_REGISTRY_URL}`,
  );
  const consumerDistDir = path.join(
    getConsumerProjectPath(),
    ".ph",
    "connect-build",
    "dist",
  );
  const consumerDistConfig = path.join(
    consumerDistDir,
    "powerhouse.config.json",
  );
  const distConfigOriginal = fs.readFileSync(consumerDistConfig, "utf-8");
  const distConfigParsed = JSON.parse(distConfigOriginal) as Record<
    string,
    unknown
  >;
  distConfigParsed.packageRegistryUrl = NEW_REGISTRY_URL;
  fs.writeFileSync(
    consumerDistConfig,
    JSON.stringify(distConfigParsed, null, 2),
  );

  // -------------------------------------------------------------------
  // Step 4b: Allow the new origin in the dist HTML's Content-Security-Policy
  // -------------------------------------------------------------------
  // CRITICAL: the meta CSP in dist/index.html is stamped at BUILD time with
  // the build-time `packageRegistryUrl` baked into its `script-src` list.
  // Changing `packageRegistryUrl` in the JSON config at runtime tells the
  // SPA's package manager to fetch from the new origin, but the browser
  // blocks the dynamic `import()` of `${cdnUrl}/<pkg>/browser/index.js`
  // with: "Refused to load the script ... violates Content Security Policy
  // directive script-src 'self' ... http://localhost:8080".
  // For the runtime URL change to actually work, the new origin has to be
  // allowlisted in the CSP too. Test this end-to-end by appending it here.
  console.log(`Allowlisting ${NEW_REGISTRY_URL} in dist/index.html CSP...`);
  const consumerDistIndex = path.join(consumerDistDir, "index.html");
  const distIndexOriginal = fs.readFileSync(consumerDistIndex, "utf-8");
  const distIndexPatched = distIndexOriginal.replace(
    "http://localhost:8080",
    `http://localhost:8080 ${NEW_REGISTRY_URL}`,
  );
  if (distIndexPatched === distIndexOriginal) {
    throw new Error(
      "Could not find http://localhost:8080 in dist/index.html CSP — " +
        "the CSP-stamping logic in builder-tools/connect-utils may have changed.",
    );
  }
  fs.writeFileSync(consumerDistIndex, distIndexPatched);

  // -------------------------------------------------------------------
  // Step 5: Refresh — same preview server, new packageRegistryUrl
  // -------------------------------------------------------------------
  console.log("Refreshing browser to pick up new registry URL...");
  await page.reload({ waitUntil: "networkidle" });
  await page
    .locator(".skeleton-loader")
    .waitFor({ state: "hidden", timeout: 60_000 });

  // -------------------------------------------------------------------
  // Diagnostics: capture console errors + 8081 network responses so a
  // failure in step 6 surfaces the actual cause (CORS, 404, JS eval
  // error, etc.) instead of just "count didn't increment".
  // -------------------------------------------------------------------
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") {
      console.log(`[browser:${msg.type()}] ${msg.text()}`);
    }
  });
  page.on("pageerror", (err) => {
    console.log(`[browser:pageerror] ${err.message}`);
  });
  page.on("response", (res) => {
    const url = res.url();
    if (url.includes(`:${NEW_REGISTRY_PORT}`)) {
      console.log(`[browser:net] ${res.status()} ${url}`);
    }
  });

  // -------------------------------------------------------------------
  // Step 6: Install test-package-vetra from the new registry via the
  //          "Available Packages" dropdown menu (same pattern as uninstall).
  // -------------------------------------------------------------------
  // We use the Available-section row + dropdown menu rather than the search
  // popover because the popover's "Install" affordance is a Combobox option,
  // not a real button — selectors against it have proven flaky and the click
  // doesn't always reliably trigger the install.
  console.log(
    "Installing test-package-vetra from new registry via the Available Packages dropdown...",
  );
  await expect(settingsButton).toBeVisible({ timeout: 30_000 });
  await settingsButton.click();
  await expect(settingsModal).toBeVisible({ timeout: 10_000 });

  // Expand the Available Packages section so its rows are in the DOM.
  // It's "Available Packages 1" because the (just-republished) package shows
  // up on the new registry but isn't installed yet.
  const availableToggle = settingsModal.getByRole("button", {
    name: /^Available Packages\b/i,
  });
  await expect(availableToggle).toBeVisible({ timeout: 30_000 });
  await availableToggle.click();

  const availableRow = settingsModal
    .locator("li")
    .filter({ has: page.locator('h3:has-text("test-package-vetra")') });
  await expect(availableRow).toBeVisible({ timeout: 30_000 });

  // The row has TWO buttons: a "latest" version picker (first) and the
  // 3-dot dropdown menu (last, top-right). We need the latter — first()
  // would open the version picker instead of the menu.
  const availableDotsButton = availableRow.locator("button").last();
  await availableDotsButton.click();
  const installMenuItem = page.getByText("Install", { exact: true });
  await expect(installMenuItem).toBeVisible({ timeout: 10_000 });
  await installMenuItem.click();

  // -------------------------------------------------------------------
  // Step 7: Verify the install succeeded against the new registry
  // -------------------------------------------------------------------
  // The strongest signal is that the "Installed Packages" count went up:
  // before the install it sits at 3 (Common, Vetra, Local), after a
  // successful fetch + register from the NEW registry it becomes 4. We
  // poll the count heading so re-renders don't break the assertion.
  await expect(
    settingsModal.getByRole("heading", { name: /Installed Packages 4/i }),
  ).toBeVisible({ timeout: 60_000 });
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
