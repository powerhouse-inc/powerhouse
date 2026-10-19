import type { Page, Route } from "@playwright/test";
import {
  canvasNode,
  coreAction,
  coreTrigger,
  createConnectionInBrowser,
  createWorkflowInBrowser,
  fireAndWait,
  gql,
  openDrive,
  openWorkflowEditor,
  pieceAction,
  REACTOR_CONNECTOR_ID,
  selectInSidebar,
  shot,
  type PhWindow,
} from "../../scripts/ui-stack.js";
import { expect, test } from "./fixtures.js";

// Every test adds the documents it needs.
test.use({ seed: false });

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

// A document's state, read back from Connect's reactor.
async function documentState<T>(app: Page, id: string): Promise<T> {
  return app.evaluate(async (documentId) => {
    const client = (window as unknown as PhWindow).ph!.reactorClientModule!
      .client;
    const document = (await client.get(documentId)) as unknown as {
      state: unknown;
    };
    return document.state;
  }, id) as Promise<T>;
}

interface StepBinding {
  steps: { reactorConnectionId: string | null }[];
}

// Answers the named workflow-runtime operations; everything else goes through.
async function answerRuntime(
  app: Page,
  answers: Record<string, (variables: Record<string, unknown>) => unknown>,
) {
  await app.route("**/graphql/workflow-runtime", async (route: Route) => {
    const body = route.request().postDataJSON() as {
      query?: string;
      variables?: Record<string, unknown>;
    } | null;
    const name = /(?:query|mutation)\s+(\w+)/.exec(body?.query ?? "")?.[1];
    const answer = name ? answers[name] : undefined;
    if (!answer) return route.fallback();
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        data: { workflowRuntime: answer(body?.variables ?? {}) },
      }),
    });
  });
}

// Renown as a signed-in user, keeping Connect's own signing key.
async function signIn(app: Page, address: string) {
  await app.evaluate((user) => {
    const w = window as unknown as {
      ph?: { renown?: object };
    };
    const real = (w.ph?.renown ?? {}) as Record<string | symbol, unknown>;
    const signedInUser = { address: user, networkId: "eip155", chainId: 1 };
    // Methods run on the real instance, whose private fields a copy lacks.
    const signedIn = new Proxy(real, {
      get(target, key) {
        if (key === "status") return "authorized";
        if (key === "user") return signedInUser;
        // Requests stay anonymous: the Switchboard knows no such user.
        if (key === "getBearerToken") return () => Promise.resolve(undefined);
        if (key === "on" && typeof target.on !== "function") {
          return () => () => undefined;
        }
        const value = target[key];
        return typeof value === "function"
          ? (value as (...a: unknown[]) => unknown).bind(target)
          : value;
      },
    });
    window.dispatchEvent(
      new CustomEvent("ph:setRenown", { detail: { renown: signedIn } }),
    );
  }, address);
}

const USER = "0x00000000000000000000000000000000000a11ce";

const HOST = {
  address: "0x5b0a2d0f0000000000000000000000000000beef",
  key: "did:key:zHostKey",
};

test.describe("Reactor steps", () => {
  let workflowId = "";
  let driveName = "";
  let driveId = "";

  test.beforeEach(async ({ stack }) => {
    workflowId = await createWorkflowInBrowser(stack.page, stack.drive, {
      name: WORKFLOW,
      trigger: { ...(await coreTrigger("manual")), config: {} },
      steps: [
        {
          key: "create",
          name: STEP,
          ...(await pieceAction(
            "@powerhousedao/piece-reactor",
            "document-create",
          )),
          config: {},
        },
      ],
    });
    // A drive of its own, named to be found among every test's "Workflows",
    // with a folder inside a folder.
    // Unique across parallel workers starting in the same millisecond.
    driveName = `Invoices ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const created = await gql<{
      DocumentDrive: { createDocument: { id: string } };
    }>(
      "/graphql/document-drive",
      `mutation($name: String!) { DocumentDrive { createDocument(name: $name) { id } } }`,
      { name: driveName },
    );
    const drive = created.DocumentDrive.createDocument.id;
    driveId = drive;
    const addFolder = `mutation($doc: String!, $input: DocumentDrive_AddFolderInput!) {
      DocumentDrive { addFolder(documentIdOrSlug: $doc, input: $input) { id } } }`;
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

    // The folder carries its drive, so the step needs no lookup.
    await expect
      .poll(() => stepConfig(app, workflowId))
      .toMatchObject({
        parentId: expect.any(String),
        folderId: {
          driveId: expect.any(String),
          folderId: `${driveId}-2026`,
        },
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
    await expect(action).toContainText("the action needs both");
    await expect(action).toContainText("Pick Type first");
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
  test("the step asks for a reactor connection and makes one", async ({
    app,
  }) => {
    const field = app.getByRole("combobox", { name: "Reactor connection" });
    await expect(field).toBeVisible();
    await expect(canvasNode(app, STEP).getByText("Incomplete")).toBeVisible();

    await field.click();
    await app.getByRole("button", { name: "New reactor connection" }).click();
    await expect
      .poll(
        async () =>
          (await documentState<{ global: StepBinding }>(app, workflowId)).global
            .steps[0].reactorConnectionId,
        { timeout: 30_000 },
      )
      .toEqual(expect.any(String));
    const connectionId = (
      await documentState<{ global: StepBinding }>(app, workflowId)
    ).global.steps[0].reactorConnectionId!;
    // The block writes, so the connection allows what it declares.
    expect(
      (
        await documentState<{ global: Record<string, unknown> }>(
          app,
          connectionId,
        )
      ).global,
    ).toMatchObject({
      connectorId: REACTOR_CONNECTOR_ID,
      authType: "REACTOR",
      config: { endpoint: "local" },
      status: "OK",
    });
    await expect(field).toContainText("Reactor access");
  });

  test("under enforcement, signing in comes before binding and publishing", async ({
    app,
  }) => {
    await answerRuntime(app, {
      ReactorAccess: () => ({
        authEnforcement: true,
        reactorIdentity: null,
        authConditions: null,
      }),
    });
    await app.reload();
    await canvasNode(app, STEP).click();
    await expect(
      app.getByRole("note", { name: "Sign in required" }),
    ).toContainText("Sign in so the workflow runs as you");
    await expect(
      app.getByRole("button", { name: "Sign in to publish" }).first(),
    ).toBeVisible();
    // Options say why they don't load, instead of loading forever.
    await expect(
      app.getByText("Sign in to load options").first(),
    ).toBeVisible();
    await shot(app, "reactor-step-sign-in");
  });

  test("the Switchboard is granted on documents from the connection", async ({
    stack,
    app,
  }) => {
    await createConnectionInBrowser(app, stack.drive, {
      name: "Ledger access",
      connectorId: REACTOR_CONNECTOR_ID,
      authType: "REACTOR",
      config: { endpoint: "local" },
      secrets: {},
    });
    const target = await createConnectionInBrowser(app, stack.drive, {
      name: "Ledger",
      connectorId: REACTOR_CONNECTOR_ID,
      authType: "REACTOR",
      config: { endpoint: "local" },
      secrets: {},
    });
    await answerRuntime(app, {
      ReactorAccess: () => ({
        authEnforcement: true,
        reactorIdentity: HOST,
        authConditions: false,
      }),
    });
    // Anyone administers its grants (Connect signs as itself, not the stand-in
    // user); nobody may write it, the Switchboard included.
    await app.evaluate(
      async ({ id }) => {
        const client = (window as unknown as PhWindow).ph!.reactorClientModule!
          .client;
        await client.execute(id, "main", [
          {
            id: crypto.randomUUID(),
            timestampUtcMs: new Date().toISOString(),
            type: "INITIALIZE_AUTH",
            input: {
              version: 1,
              grants: [
                {
                  id: "admin",
                  description: "admin",
                  effect: "allow",
                  principal: { anyone: true },
                  capability: { can: "execute", scope: "auth" },
                },
              ],
            },
            scope: "auth",
          },
        ] as never);
      },
      { id: target },
    );
    // Signed in from the workflow editor the beforeEach opened, then Back to
    // the drive; Connect's shell would reset on a sign-in from the drive view.
    await signIn(app, USER);
    await app.getByRole("button", { name: "Back" }).click();
    await selectInSidebar(app, "Ledger access");

    const grants = app.getByRole("region", { name: "Switchboard grants" });
    await expect(grants).toBeVisible({ timeout: 30_000 });
    await grants
      .getByRole("combobox", { name: "Documents to grant on" })
      .click();
    await app.getByPlaceholder("Search").fill("Ledger");
    await app.getByRole("option", { name: /^Ledger\b(?! access)/ }).click();
    await app.keyboard.press("Escape");
    await shot(app, "reactor-connection-grants");

    await grants
      .getByRole("button", { name: "Grant the Switchboard on Ledger" })
      .click();
    // Global execute, plus the document scope a create in a drive and a delete need.
    await expect
      .poll(
        async () =>
          (
            await documentState<{
              auth: { grants: { principal: unknown; capability: unknown }[] };
            }>(app, target)
          ).auth.grants,
      )
      .toEqual([
        expect.objectContaining({ id: "admin" }),
        expect.objectContaining({
          principal: { address: HOST.address },
          capability: { can: "execute", scope: "global" },
        }),
        expect.objectContaining({
          principal: { address: HOST.address },
          capability: {
            can: "execute",
            scope: "document",
            operation: [
              "DELETE_DOCUMENT",
              "ADD_RELATIONSHIP",
              "REMOVE_RELATIONSHIP",
            ],
          },
        }),
      ]);
    await expect(
      grants.getByRole("list", { name: "Documents the Switchboard may write" }),
    ).toContainText("Ledger");
  });

  test("a run refused reactor access shows the error", async ({ app }) => {
    const run = await fireAndWait(workflowId);
    expect(run.steps.find((step) => step.stepKey === "create")?.error).toMatch(
      /bind a reactor connection/,
    );
    // Reopened, the panel reads the latest run once the listing has it.
    const refused = app.getByText(/bind a reactor connection/);
    await expect(async () => {
      await app.getByRole("button", { name: "Close panel" }).click();
      await canvasNode(app, STEP).click();
      await app.getByRole("tab", { name: /Last run/ }).click();
      await expect(refused).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 30_000 });
    // The live snapshot, not only the draft, lacks the connection.
    const live = app.getByRole("alert", {
      name: "Published version incomplete",
    });
    await expect(live).toHaveText("Live version incomplete");
    await expect(live).toHaveAttribute("title", /Create invoice/);
    await shot(app, "reactor-step-run-error");
    await app.getByRole("tab", { name: /Setup/ }).click();
    // Connect's anonymous publish is unsigned.
    await expect(app.getByLabel("Runs as")).toContainText("Published unsigned");
    // The header fits a narrower window.
    await app.setViewportSize({ width: 1100, height: 800 });
    // Whole, not cut off: the workflow name gives way instead.
    await expect(live).toHaveText("Live version incomplete");
    const box = await live.boundingBox();
    expect(box && box.width).toBeGreaterThan(100);
    // Nothing is pushed out of the window: the header wraps instead.
    const publish = await app
      .getByRole("button", { name: "Publish", exact: true })
      .first()
      .boundingBox();
    expect(publish && publish.x + publish.width).toBeLessThanOrEqual(1100);
    await shot(app, "reactor-step-header-narrow");
  });

  test("the header says why the published workflow has no reactor access", async ({
    app,
  }) => {
    await answerRuntime(app, {
      ReactorAccessDenial: () => ({
        reactorAccessDenial:
          'The publisher 0xabc cannot read reactor connection "conn-1"',
      }),
    });
    await app.reload();
    await expect(
      app.getByRole("alert", { name: "Reactor access denied" }),
    ).toContainText('cannot read reactor connection "conn-1"');
  });
});

test.describe("Reactor step outputs", () => {
  test("a read's last run shows a document reference, and the picker offers its model's fields", async ({
    stack,
    app,
  }) => {
    const reactorConnectionId = await createConnectionInBrowser(
      app,
      stack.drive,
      {
        name: "Ledger access",
        connectorId: REACTOR_CONNECTOR_ID,
        authType: "REACTOR",
        config: { endpoint: "local" },
        secrets: {},
      },
    );
    const target = await createConnectionInBrowser(app, stack.drive, {
      name: "Ledger",
      connectorId: "@acme/ledger#ledger",
      authType: "CUSTOM_AUTH",
      config: {},
      secrets: {},
    });
    const workflowId = await createWorkflowInBrowser(app, stack.drive, {
      name: "Read the ledger",
      trigger: { ...(await coreTrigger("manual")), config: {} },
      steps: [
        {
          key: "get",
          name: "Get ledger",
          ...(await pieceAction(
            "@powerhousedao/piece-reactor",
            "document-get",
          )),
          config: { documentId: target },
          reactorConnectionId,
        },
        {
          key: "check",
          name: "Check ledger",
          ...(await coreAction("assert")),
          config: { value: "ok" },
        },
      ],
    });
    // The switchboard may not have the target yet: fire until the read lands.
    let output: unknown;
    await expect(async () => {
      const run = await fireAndWait(workflowId);
      expect(run.status).toBe("SUCCEEDED");
      output = run.steps.find((step) => step.stepKey === "get")?.output;
    }).toPass({ timeout: 60_000 });
    // The journal holds a reference, never the document's state.
    expect(output).toEqual({
      $documentRef: {
        documentId: target,
        documentType: "powerhouse/connection",
        branch: "main",
        revision: expect.objectContaining({ global: expect.any(Number) }),
      },
    });

    await openWorkflowEditor(app, "Read the ledger");
    const references = app.getByRole("group", { name: "Document references" });
    await expect(async () => {
      await canvasNode(app, "Get ledger").click();
      await app.getByRole("tab", { name: /Last run/ }).click();
      await expect(references).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 30_000 });
    const produced = app.getByRole("region", { name: "Produced" });
    await expect(produced).toContainText("powerhouse/connection");
    await expect(produced).toContainText(/Revision .*global \d+/);
    await expect(produced).toContainText("past revisions can't be read yet");
    await expect(produced).not.toContainText("@acme/ledger#ledger");
    await shot(app, "reactor-step-document-reference");

    // A later step's picker offers the referenced model's state fields.
    await app.getByRole("button", { name: "Close panel" }).click();
    await canvasNode(app, "Check ledger").click();
    const value = app.getByRole("textbox", { name: /Value/ });
    await value.focus();
    await app
      .locator(String.raw`div.group\/field`, { has: value })
      .getByRole("button", { name: "Insert data" })
      .click();
    const popup = app.locator(".workflow-expression-popup");
    await expect(popup.getByText(/^from run /).first()).toBeVisible();
    await popup.getByPlaceholder("Search paths…").fill("connectorId");
    await expect(
      popup.getByRole("button", {
        name: /steps\.get\.output\.state\.global\.connectorId/,
      }),
    ).toBeVisible();
    await shot(app, "reactor-step-reference-picker");
    await value.press("Escape");

    // Open document shows the document as it is now, in Connect.
    await app.getByRole("button", { name: "Close panel" }).click();
    await canvasNode(app, "Get ledger").click();
    await app.getByRole("tab", { name: /Last run/ }).click();
    await produced
      .getByRole("button", { name: `Open document ${target}` })
      .click();
    await expect(app).toHaveURL(new RegExp(target));
  });
});
