import type { Page } from "@playwright/test";
import {
  coreTrigger,
  createConnectionInBrowser,
  createWorkflowInBrowser,
  openDrive,
  pieceAction,
  REACTOR_CONNECTOR_ID,
  selectInSidebar,
  shot,
  type PhWindow,
} from "../../scripts/ui-stack.js";
import { expect, test } from "./fixtures.js";

// Every test adds the documents it needs.
test.use({ seed: false });

const CONNECTION = "Invoice access";

async function connectionConfig(app: Page, id: string): Promise<unknown> {
  return app.evaluate(async (documentId) => {
    const client = (window as unknown as PhWindow).ph!.reactorClientModule!
      .client;
    const document = (await client.get(documentId)) as unknown as {
      state: { global: { config: unknown } };
    };
    return document.state.global.config;
  }, id);
}

test.describe("Reactor connection setup", () => {
  let connectionId = "";

  test.beforeEach(async ({ stack, app }) => {
    connectionId = await createConnectionInBrowser(app, stack.drive, {
      name: CONNECTION,
      connectorId: REACTOR_CONNECTOR_ID,
      authType: "REACTOR",
      config: { endpoint: "local" },
      secrets: {},
    });
    await createWorkflowInBrowser(app, stack.drive, {
      name: "File invoices",
      enabled: false,
      trigger: { ...(await coreTrigger("manual")), config: {} },
      steps: [
        {
          key: "find",
          name: "Find invoice",
          ...(await pieceAction(
            "@powerhousedao/piece-reactor",
            "document-get",
          )),
          config: {},
          reactorConnectionId: connectionId,
        },
        {
          key: "file",
          name: "File invoice",
          ...(await pieceAction(
            "@powerhousedao/piece-reactor",
            "document-dispatch",
          )),
          config: {},
          reactorConnectionId: connectionId,
        },
      ],
    });
    await openDrive(app);
    await selectInSidebar(app, CONNECTION);
  });

  test("access is edited, and each step's declaration shows", async ({
    app,
  }) => {
    await expect(
      app.getByRole("combobox").filter({ hasText: "Powerhouse documents" }),
    ).toBeVisible();
    // A reactor connection is checked, not signed in.
    // Until the Switchboard has the new connection, it reads as forbidden.
    await expect(async () => {
      await app.getByRole("button", { name: "Check connection" }).click();
      await expect(app.getByText("Local reactor, write access")).toBeVisible({
        timeout: 3000,
      });
    }).toPass({ timeout: 30_000 });
    await expect(app.getByText("Checked", { exact: true })).toBeVisible();
    const steps = app.getByRole("region", {
      name: "Steps that use this connection",
    });
    await expect(steps).toContainText("File invoices · Find invoice");
    await expect(steps.getByLabel("Find invoice declares")).toHaveText("Reads");
    await expect(steps.getByLabel("File invoice declares")).toHaveText(
      "Reads and writes",
    );

    await app.getByRole("radio", { name: "Read only" }).click();
    await expect
      .poll(() => connectionConfig(app, connectionId))
      .toEqual({ endpoint: "local", access: "read" });
    // The writing step now fails on its first write.
    await expect(steps).toContainText(
      "Writes, but this connection allows reads only",
    );

    await shot(app, "reactor-connection-setup");
  });
});
