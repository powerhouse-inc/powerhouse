/**
 * Repro for the reported bug:
 * 1. fresh project + `ph vetra --watch`
 * 2. (vetra drive) create a new doc model + editor -> v1 folder generated
 * 3. (preview drive) create a doc with v1
 * 4. (vetra drive) add a field to the state schema, accept the release prompt
 *    -> v2 folder generated
 * 5. (preview drive) open the doc, click "Update document" -> error appears
 *
 * The document model and editor are authored server-side through the
 * switchboard GraphQL subgraphs (the same reactor the vetra drive documents
 * live in, and the same path the reactor-mcp agent flow uses). The browser
 * is used only for the steps under test: creating the v1 document in the
 * preview drive and clicking "Update document" after the v2 release.
 *
 * This spec is instrumented for diagnosis: it captures console errors, page
 * errors, registry/package-manager state, and screenshots at each step.
 */
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { Page } from "@playwright/test";
import { expect, test } from "./helpers/fixtures.js";
import { LONG_VISIBLE_TIMEOUT } from "./helpers/timeouts.js";
import { waitForAppReady } from "./helpers/wait.js";

test.describe.configure({ mode: "serial", timeout: 10 * 60 * 1000 });

const REACTOR_URL = process.env.REPRO_REACTOR_URL ?? "http://localhost:4002";
// Both default to this project; override to run the repro against another
// project (e.g. a clean `ph init` scaffold serving on the same ports).
const PROJECT_DIR = process.env.REPRO_PROJECT_DIR ?? process.cwd();
const VETRA_DRIVE = process.env.REPRO_VETRA_DRIVE ?? "vetra-e4fc1809";

const MODEL_NAME = "BugRepro";
const MODEL_DIR = "bug-repro";
const DOC_TYPE = "test/bug-repro";
const DOC_NAME = "MyBugReproDoc";

const SCHEMA_V1 = "type BugReproState {\n  name: String\n}";
const INITIAL_STATE_V1 = '{\n  "name": ""\n}';
const SCHEMA_V2 = "type BugReproState {\n  name: String\n  title: String!\n}";

const OUT_DIR = path.join(process.cwd(), "repro-artifacts");

type Diag = {
  consoleErrors: string[];
  pageErrors: string[];
  notes: string[];
};

const diag: Diag = {
  consoleErrors: [],
  pageErrors: [],
  notes: [],
};

function note(msg: string) {
  console.log(`[repro] ${msg}`);
  diag.notes.push(msg);
}

async function gql(
  subgraph: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await fetch(`${REACTOR_URL}/graphql/${subgraph}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const body = (await response.json()) as {
    data?: Record<string, unknown>;
    errors?: { message: string }[];
  };
  if (body.errors?.length) {
    throw new Error(
      `GraphQL ${subgraph} error: ${body.errors.map((e) => e.message).join("; ")}`,
    );
  }
  if (!body.data) {
    throw new Error(`GraphQL ${subgraph}: empty response`);
  }
  return body.data;
}

function attachDiagnostics(page: Page) {
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      diag.consoleErrors.push(msg.text());
      console.log(`[console.error] ${msg.text().slice(0, 600)}`);
    }
  });
  page.on("pageerror", (err) => {
    diag.pageErrors.push(`${err.name}: ${err.message}\n${err.stack ?? ""}`);
    console.log(`[pageerror] ${err.name}: ${err.message}`);
  });
}

async function dumpRegistryState(page: Page, label: string) {
  const state = await page.evaluate((docType) => {
    const ph = (
      window as unknown as {
        ph?: {
          reactorClientModule?: {
            reactorModule?: {
              documentModelRegistry?: {
                getAllModules: () => {
                  documentModel: { global: { id: string } };
                  version?: number;
                }[];
                getUpgradeManifest: (type: string) => {
                  latestVersion: number;
                  upgrades: Record<string, unknown>;
                };
              };
            };
          };
          vetraPackageManager?: {
            packages: {
              documentModels: {
                documentModel: { global: { id: string } };
                version?: number;
              }[];
            }[];
          };
        };
      }
    ).ph;
    const registry = ph?.reactorClientModule?.reactorModule?.documentModelRegistry;
    const pm = ph?.vetraPackageManager;
    const registryVersions = registry
      ? registry
          .getAllModules()
          .filter((m) => m.documentModel.global.id === docType)
          .map((m) => m.version ?? 1)
      : "no-registry";
    let manifest: unknown = "no-registry";
    if (registry) {
      try {
        const m = registry.getUpgradeManifest(docType);
        manifest = {
          latestVersion: m.latestVersion,
          upgradeKeys: Object.keys(m.upgrades),
        };
      } catch (e) {
        manifest = `threw: ${String(e)}`;
      }
    }
    const pmVersions = pm
      ? pm.packages
          .flatMap((p) => p.documentModels)
          .filter((m) => m.documentModel.global.id === docType)
          .map((m) => m.version ?? 1)
      : "no-pm";
    return { registryVersions, manifest, pmVersions };
  }, DOC_TYPE);
  note(`${label}: ${JSON.stringify(state)}`);
  return state;
}

async function markPage(page: Page) {
  await page.evaluate(() => {
    (window as unknown as { __reproPageMarker?: boolean }).__reproPageMarker =
      true;
  });
}

async function pageWasReloaded(page: Page): Promise<boolean> {
  return page.evaluate(
    () =>
      !(window as unknown as { __reproPageMarker?: boolean }).__reproPageMarker,
  );
}

async function screenshot(page: Page, name: string) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  await page.screenshot({
    path: path.join(OUT_DIR, `${name}.png`),
    fullPage: true,
  });
}

async function navigateToDrive(page: Page, driveHeading: string) {
  await page.goto("/");
  await waitForAppReady(page);
  await page
    .locator(".skeleton-loader")
    .waitFor({ state: "hidden", timeout: 30000 });
  const drive = page.getByRole("heading", {
    name: driveHeading,
    level: 3,
    exact: true,
  });
  await expect(drive).toBeVisible({ timeout: LONG_VISIBLE_TIMEOUT });
  await drive.click();
  await waitForAppReady(page);
}

async function pollForFile(
  filePath: string,
  contains: string | undefined,
  maxWaitMs: number,
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    if (fs.existsSync(filePath)) {
      if (contains === undefined) return true;
      const content = fs.readFileSync(filePath, "utf-8");
      if (content.includes(contains)) return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

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

test("repro: v1 doc upgrade after v2 release errors", async ({ page }) => {
  test.setTimeout(8 * 60 * 1000);
  attachDiagnostics(page);

  const modelsDir = path.join(PROJECT_DIR, "document-models");

  // ---------------------------------------------------------------
  // Step 1 (server): author the document model -> v1 codegen
  // ---------------------------------------------------------------
  note("STEP 1: authoring document model via switchboard GraphQL");
  const created = await gql(
    "document-model",
    `mutation ($name: String!, $drive: String) {
       DocumentModel { createDocument(name: $name, parentIdentifier: $drive) { id } }
     }`,
    { name: MODEL_NAME, drive: VETRA_DRIVE },
  );
  const modelDocId = (
    created.DocumentModel as { createDocument: { id: string } }
  ).createDocument.id;
  note(`model document created: ${modelDocId}`);

  const call = async (field: string, input: Record<string, unknown>) => {
    await gql(
      "document-model",
      `mutation ($docId: PHID!, $input: DocumentModel_${field[0].toUpperCase()}${field.slice(1)}Input!) {
         DocumentModel { ${field}(docId: $docId, input: $input) { id } }
       }`,
      { docId: modelDocId, input },
    );
  };

  await call("setModelName", { name: MODEL_NAME });
  await call("setModelId", { id: DOC_TYPE });
  await call("setModelExtension", { extension: ".tbr" });
  await call("setModelDescription", { description: "Bug repro model" });
  await call("setAuthorName", { authorName: "Repro" });
  await call("setStateSchema", { scope: "global", schema: SCHEMA_V1 });
  await call("setInitialState", {
    scope: "global",
    initialValue: INITIAL_STATE_V1,
  });
  const moduleId = randomUUID();
  await call("addModule", { id: moduleId, name: "base" });
  await call("addOperation", {
    moduleId,
    id: randomUUID(),
    name: "ADD_ITEM",
    schema: "input AddItemInput {\n  name: String!\n}",
    scope: "global",
  });
  note("model actions dispatched");

  const v1Ok = await pollForFile(
    path.join(modelsDir, "index.ts"),
    `${MODEL_NAME} as ${MODEL_NAME}V1`,
    90_000,
  );
  note(`v1 codegen complete: ${v1Ok}`);
  expect(v1Ok).toBe(true);
  expect(fs.existsSync(path.join(modelsDir, MODEL_DIR, "v1"))).toBe(true);

  // ---------------------------------------------------------------
  // Step 2 (server): author + confirm the editor -> editor codegen
  // ---------------------------------------------------------------
  note("STEP 2: authoring document editor via switchboard GraphQL");
  const editorCreated = await gql(
    "document-editor",
    `mutation ($name: String!, $drive: String) {
       DocumentEditor { createDocument(name: $name, parentIdentifier: $drive) { id } }
     }`,
    { name: "BugReproEditor", drive: VETRA_DRIVE },
  );
  const editorDocId = (
    editorCreated.DocumentEditor as { createDocument: { id: string } }
  ).createDocument.id;

  const editorCall = async (
    field: string,
    inputType: string,
    input: Record<string, unknown>,
  ) => {
    await gql(
      "document-editor",
      `mutation ($docId: PHID!, $input: ${inputType}!) {
         DocumentEditor { ${field}(docId: $docId, input: $input) { id } }
       }`,
      { docId: editorDocId, input },
    );
  };
  await editorCall("setEditorName", "DocumentEditor_SetEditorNameInput", {
    name: "BugReproEditor",
  });
  // The generated subgraph input renames `id` to `DocumentEditor_id` but the
  // resolver forwards the input unchanged, so the action rejects it. Dispatch
  // the raw action through the generic reactor mutation instead.
  await gql(
    "r",
    `mutation ($id: String!, $actions: [ActionInput!]!) {
       mutateDocument(documentIdentifier: $id, actions: $actions) { id }
     }`,
    {
      id: editorDocId,
      actions: [
        {
          id: randomUUID(),
          type: "ADD_DOCUMENT_TYPE",
          scope: "global",
          timestampUtcMs: new Date().toISOString(),
          input: { id: randomUUID(), documentType: DOC_TYPE },
        },
      ],
    },
  );
  await editorCall("setEditorStatus", "DocumentEditor_SetEditorStatusInput", {
    status: "CONFIRMED",
  });

  const editorsOk = await pollForFile(
    path.join(PROJECT_DIR, "editors", "editors.ts"),
    "BugReproEditor",
    90_000,
  );
  note(`editor codegen complete: ${editorsOk}`);
  expect(editorsOk).toBe(true);

  // ---------------------------------------------------------------
  // Step 3 (browser): create a v1 document in the preview drive
  // ---------------------------------------------------------------
  note("STEP 3: creating v1 document in preview drive (browser)");
  await navigateToDrive(page, "Vetra Preview");
  await screenshot(page, "01-preview-drive");

  const createNewDocButton = page.getByRole("button", {
    name: "Create New Document",
  });
  await expect(createNewDocButton).toBeVisible({ timeout: 60_000 });
  await createNewDocButton.click();

  const createDialog = page.locator('form[name="create-document-with-type"]');
  await expect(createDialog).toBeVisible({ timeout: 10_000 });
  await createDialog.getByPlaceholder("Document name").fill(DOC_NAME);

  await createDialog.locator("#document-type").click();
  await screenshot(page, "02-doc-type-dropdown");
  const optionV1 = page.getByText(`${MODEL_NAME} v1`, { exact: true }).last();
  await expect(optionV1).toBeVisible({ timeout: 10_000 });
  await optionV1.click();

  const createBtn = createDialog.getByRole("button", { name: "Create" });
  await expect(createBtn).toBeEnabled({ timeout: 10_000 });
  await createBtn.click();
  await waitForAppReady(page);
  await screenshot(page, "03-doc-created");
  await dumpRegistryState(page, "after doc creation");
  const docUrl = page.url();
  note(`document url: ${docUrl}`);
  await markPage(page);

  // ---------------------------------------------------------------
  // Step 4 (server): release v2 with a new required field
  // ---------------------------------------------------------------
  note("STEP 4: releasing v2 (RELEASE_NEW_VERSION + new schema)");
  await gql(
    "r",
    `mutation ($id: String!, $actions: [ActionInput!]!) {
       mutateDocument(documentIdentifier: $id, actions: $actions) { id }
     }`,
    {
      id: modelDocId,
      actions: [
        {
          id: randomUUID(),
          type: "RELEASE_NEW_VERSION",
          scope: "global",
          timestampUtcMs: new Date().toISOString(),
          input: {},
        },
      ],
    },
  );
  await call("setStateSchema", { scope: "global", schema: SCHEMA_V2 });
  note("release + v2 schema dispatched");

  const v2Ok = await pollForFile(
    path.join(modelsDir, "index.ts"),
    `${MODEL_NAME} as ${MODEL_NAME}V2`,
    120_000,
  );
  note(`v2 codegen complete: ${v2Ok}`);
  expect(v2Ok).toBe(true);
  const manifestOk = await pollForFile(
    path.join(modelsDir, MODEL_DIR, "upgrades", "upgrade-manifest.ts"),
    "v2",
    60_000,
  );
  note(`upgrade manifest generated: ${manifestOk}`);

  // Give vite HMR time to propagate the regenerated package to the browser.
  await page.waitForTimeout(15_000);
  note(`page fully reloaded during release: ${await pageWasReloaded(page)}`);
  await dumpRegistryState(page, "after v2 release + HMR settle");
  await screenshot(page, "04-after-v2-release");

  // ---------------------------------------------------------------
  // Step 5 (browser): open the doc, click "Update document"
  // ---------------------------------------------------------------
  note("STEP 5: opening the v1 document in preview drive");
  await page.goto(docUrl);
  await waitForAppReady(page);
  await screenshot(page, "05-doc-opened");
  await dumpRegistryState(page, "doc opened after v2");

  const upgradeButton = page.getByTestId("toolbar-upgrade-button");
  const upgradeButtonVisible = await upgradeButton
    .waitFor({ state: "visible", timeout: 30_000 })
    .then(() => true)
    .catch(() => false);
  note(`toolbar upgrade button visible: ${upgradeButtonVisible}`);
  await screenshot(page, "06-before-upgrade-click");

  if (upgradeButtonVisible) {
    await upgradeButton.click();
    note("clicked toolbar upgrade button");
    await page.waitForTimeout(1000);
    await screenshot(page, "07-after-toolbar-click");

    const confirmModalButton = page.getByRole("button", {
      name: "Update document",
    });
    const modalVisible = await confirmModalButton
      .waitFor({ state: "visible", timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
    note(`confirm-upgrade modal rendered: ${modalVisible}`);

    if (modalVisible) {
      await confirmModalButton.click();
      note("clicked 'Update document' in the confirm modal");
    }
  }

  await page.waitForTimeout(8_000);
  await screenshot(page, "08-after-upgrade-attempt");
  await dumpRegistryState(page, "after upgrade attempt");

  const bodyText = await page.locator("body").innerText();
  const needles = [
    "Something went wrong",
    "Error",
    "not supported",
    "failed",
    "Failed",
  ];
  note(
    `error-ish strings visible on page: ${JSON.stringify(
      needles.filter((s) => bodyText.includes(s)),
    )}`,
  );

  // ---------------------------------------------------------------
  // Step 6 (browser): reload the page (registry re-seeds from the package
  // manager and recovers v2), then retry the upgrade click. This is the arm
  // where the upgrade actually executes.
  // ---------------------------------------------------------------
  note("STEP 6: full page reload, then retry the upgrade");
  await page.goto(docUrl);
  await page.reload();
  await waitForAppReady(page);
  await dumpRegistryState(page, "after full reload, doc open");
  await screenshot(page, "09-after-reload-doc-open");

  const upgradeButton2 = page.getByTestId("toolbar-upgrade-button");
  const upgradeButton2Visible = await upgradeButton2
    .waitFor({ state: "visible", timeout: 30_000 })
    .then(() => true)
    .catch(() => false);
  note(`(reload arm) toolbar upgrade button visible: ${upgradeButton2Visible}`);

  if (upgradeButton2Visible) {
    await upgradeButton2.click();
    await page.waitForTimeout(1000);
    await screenshot(page, "10-reload-after-toolbar-click");
    const confirmModalButton2 = page.getByRole("button", {
      name: "Update document",
    });
    const modal2Visible = await confirmModalButton2
      .waitFor({ state: "visible", timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
    note(`(reload arm) confirm-upgrade modal rendered: ${modal2Visible}`);
    if (modal2Visible) {
      await confirmModalButton2.click();
      note("(reload arm) clicked 'Update document' in the confirm modal");
    }
  }

  await page.waitForTimeout(8_000);
  await screenshot(page, "11-reload-after-upgrade-attempt");
  await dumpRegistryState(page, "(reload arm) after upgrade attempt");

  const bodyTextAfterReload = await page.locator("body").innerText();
  note(
    `(reload arm) error-ish strings visible on page: ${JSON.stringify(
      needles.filter((s) => bodyTextAfterReload.includes(s)),
    )}`,
  );

  const docState = await page.evaluate(async (docType) => {
    const ph = (
      window as unknown as {
        ph?: {
          reactorClientModule?: {
            client?: {
              find: (filter: { type: string }) => Promise<{
                results: {
                  header: { id: string; name: string; revision: unknown };
                  state?: {
                    document?: { version?: number };
                    global?: unknown;
                  };
                }[];
              }>;
            };
          };
        };
      }
    ).ph;
    const client = ph?.reactorClientModule?.client;
    if (!client) return "no-client";
    try {
      const results = await client.find({ type: docType });
      return results.results.map((d) => ({
        id: d.header.id,
        name: d.header.name,
        version: d.state?.document?.version,
        globalState: d.state?.global,
        revision: d.header.revision,
      }));
    } catch (e) {
      return `find threw: ${String(e)}`;
    }
  }, DOC_TYPE);
  note(`document state after upgrade attempt: ${JSON.stringify(docState)}`);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(OUT_DIR, "diagnostics.json"),
    JSON.stringify(diag, null, 2),
  );
  note(`diagnostics written to ${path.join(OUT_DIR, "diagnostics.json")}`);

  // The bug: the upgrade stamps version 2 but runs the generated no-op
  // migration stub, so the required v2 field is missing. The editor then
  // crashes with a ZodError from the generated version-aware validator, and
  // the switchboard (which never receives v2 modules or upgrade manifests)
  // dead-letters the synced upgrade operation forever.
  const zodErrors = diag.consoleErrors.filter((e) => e.includes("ZodError"));
  const deadLetters = diag.consoleErrors.filter((e) =>
    e.toLowerCase().includes("dead letter"),
  );
  expect(
    zodErrors,
    "editor must not crash validating the upgraded document",
  ).toEqual([]);
  expect(
    deadLetters,
    "the upgrade operation must sync to the switchboard",
  ).toEqual([]);
});
