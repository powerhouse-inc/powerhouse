import type { Page } from "@playwright/test";
import {
  canvasNode,
  createWorkflowInBrowser,
  gql,
  openWorkflowEditor,
  pieceBlockType,
  type PhWindow,
} from "../../scripts/ui-stack.js";
import { expect, test } from "./fixtures.js";

const WORKFLOW = "File an invoice";
const STEP = "Create invoice";

// The stored config of the one step, read back from the document.
async function stepConfig(app: Page, workflowId: string) {
  return app.evaluate(async (id) => {
    const client = (window as unknown as PhWindow).ph!.reactorClientModule!
      .client;
    const document = (await client.get(id)) as unknown as {
      state: { global: { steps: { config: Record<string, unknown> }[] } };
    };
    return document.state.global.steps[0].config;
  }, workflowId);
}

// A picker's search box, opened from the field's combobox.
async function pick(app: Page, field: string, search: string, option: RegExp) {
  await app.getByRole("combobox", { name: field }).click();
  const box = app.getByPlaceholder("Search");
  await expect(box).toBeFocused();
  await box.fill(search);
  // Options load when the field mounts; reload if they predate the data.
  await expect(async () => {
    if (!(await app.getByRole("option", { name: option }).isVisible())) {
      await app.getByRole("button", { name: "Reload options" }).click();
    }
    await expect(app.getByRole("option", { name: option })).toBeVisible({
      timeout: 2000,
    });
  }).toPass({ timeout: 30_000 });
  await app.getByRole("option", { name: option }).click();
}

test.describe("Reactor steps", () => {
  let workflowId = "";
  let driveName = "";

  test.beforeEach(async ({ stack }) => {
    workflowId = await createWorkflowInBrowser(stack.page, stack.drive, {
      name: WORKFLOW,
      trigger: { blockType: "core#manual", config: {} },
      steps: [
        {
          key: "create",
          name: STEP,
          blockType: await pieceBlockType(
            "@powerhousedao/piece-reactor",
            "document-create",
          ),
          config: {},
        },
      ],
    });
    // A drive of its own, named to be found among every test's "Workflows",
    // with a folder inside a folder.
    driveName = `Invoices ${Date.now().toString(36)}`;
    const created = await gql<{
      DocumentDrive: { createDocument: { id: string } };
    }>(
      "/graphql/document-drive",
      `mutation($name: String!) { DocumentDrive { createDocument(name: $name) { id } } }`,
      { name: driveName },
    );
    const drive = created.DocumentDrive.createDocument.id;
    const addFolder = `mutation($doc: PHID!, $input: DocumentDrive_AddFolderInput!) {
      DocumentDrive { addFolder(docId: $doc, input: $input) { id } } }`;
    await gql("/graphql/document-drive", addFolder, {
      doc: drive,
      input: { id: `${drive}-invoices`, name: "Invoices" },
    });
    await gql("/graphql/document-drive", addFolder, {
      doc: drive,
      input: {
        id: `${drive}-2026`,
        name: "2026",
        parentFolder: `${drive}-invoices`,
      },
    });
    await openWorkflowEditor(stack.page, WORKFLOW);
    await canvasNode(stack.page, STEP).click();
  });

  test("the drive and folder are picked by name, the folder after the drive", async ({
    app,
  }) => {
    // Waiting on the drive: disabled, saying why.
    const folder = app.getByRole("combobox", { name: /Folder/ });
    await expect(folder).toBeDisabled();
    await expect(folder).toContainText("Pick a drive first");

    await pick(app, "Parent drive", driveName, new RegExp(driveName));
    await expect(
      app.getByRole("combobox", { name: /Parent drive/ }),
    ).toContainText(driveName);

    await pick(app, "Folder", "2026", /Invoices \/ 2026/);
    await expect(app.getByRole("combobox", { name: /Folder/ })).toContainText(
      "Invoices / 2026",
    );

    await expect
      .poll(() => stepConfig(app, workflowId))
      .toMatchObject({
        parentId: expect.any(String),
        folderId: expect.any(String),
      });
  });

  test("an expression replaces the pick, and the list comes back", async ({
    app,
  }) => {
    await app.getByRole("combobox", { name: /Parent drive/ }).click();
    await app.getByText("Use data from an earlier step").click();
    const input = app.getByRole("textbox", { name: /Parent drive/ });
    await input.fill("{{trigger.payload.driveId}}");
    await input.blur();
    await expect
      .poll(() => stepConfig(app, workflowId))
      .toMatchObject({ parentId: "{{trigger.payload.driveId}}" });

    await app.getByRole("button", { name: "Pick from list" }).click();
    await expect(
      app.getByRole("combobox", { name: /Parent drive/ }),
    ).toBeVisible();
  });

  test("the first action's input is a form built from the model", async ({
    app,
  }) => {
    await pick(app, "Document type", "connection", /powerhouse\/connection/);
    // Type and Input sit together in the Action section.
    const action = app.getByRole("region", { name: "Action" });
    await expect(action).toBeVisible();
    await action.getByRole("combobox", { name: /Type/ }).click();
    await app.getByPlaceholder("Search").fill("SET_CONNECTOR");
    await app.getByRole("option", { name: /SET_CONNECTOR/ }).click();

    // One field per input field; the enum's values come from the model.
    const connector = app.getByRole("textbox", { name: /Connector id/ });
    await connector.fill("@acme/piece#x");
    await connector.blur();
    await app.getByRole("combobox", { name: /Auth type/ }).click();
    await app.getByRole("option", { name: /Custom auth/ }).click();

    await expect
      .poll(() => stepConfig(app, workflowId))
      .toMatchObject({
        documentType: "powerhouse/connection",
        actionType: "SET_CONNECTOR",
        input: { connectorId: "@acme/piece#x", authType: "CUSTOM_AUTH" },
      });
  });
});
