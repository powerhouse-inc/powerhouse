// Testing one step at a time, against services the test starts itself.
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Page } from "@playwright/test";
import {
  canvasNode,
  coreTrigger,
  createWorkflowInBrowser,
  openWorkflowEditor,
  pieceAction,
  shot,
  waitServed,
} from "../../scripts/ui-stack.js";
import { expect, test } from "./fixtures.js";

// Every test adds the documents it needs.
test.use({ seed: false });

let server: Server;
let port = 0;

test.beforeAll(async () => {
  server = createServer((_request, response) => {
    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify({ "content.type": "json", port, items: ["a", "b"] }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});

test.afterAll(() => server.close());

async function createTestWorkflow(page: Page, drive: string) {
  const http = await pieceAction("@activepieces/piece-http", "send_request");
  const parse = await pieceAction("@activepieces/piece-http", "parse_url");
  const id = await createWorkflowInBrowser(page, drive, {
    name: "Test me",
    enabled: false,
    trigger: { ...(await coreTrigger("manual")), config: {} },
    steps: [
      {
        key: "call",
        name: "Call",
        ...http,
        config: { method: "GET", url: `http://127.0.0.1:${port}/data` },
      },
      {
        key: "use",
        name: "Use",
        ...parse,
        config: {
          url: `http://127.0.0.1:{{steps.call.output.body.port}}/done`,
        },
      },
      {
        key: "broken",
        name: "Broken",
        ...http,
        // Nothing listens on the discard port.
        config: { method: "GET", url: "http://127.0.0.1:9/down" },
      },
    ],
  });
  await waitServed(id, "call");
  return id;
}

const badge = (page: Page, node: string, text: string) =>
  canvasNode(page, node).getByText(text, { exact: true });
const tick = (page: Page, node: string) =>
  canvasNode(page, node).getByLabel("Tested", { exact: true });

test.describe("Test step", () => {
  test("points at the step to test first, then shows the output and offers it to the picker", async ({
    stack,
    app,
  }) => {
    await createTestWorkflow(app, stack.drive);
    await openWorkflowEditor(app, "Test me");
    for (const node of ["Call", "Use", "Broken"]) {
      await expect(badge(app, node, "Test me")).toBeVisible();
    }

    await canvasNode(app, "Use").click();
    await expect(app.getByText("Not tested yet")).toBeVisible();
    await app.getByRole("button", { name: "Test step" }).click();
    const refusal = app.getByRole("alert");
    await expect(refusal).toContainText('Test "call" first');
    await expect(refusal).toContainText("Nothing ran.");
    await shot(app, "step-test-upstream-first");

    // The link opens the step that has to be tested first.
    await refusal.getByRole("button", { name: "Open Call" }).click();
    await expect(app.getByRole("textbox", { name: "Step name" })).toHaveValue(
      "Call",
    );
    await app.getByRole("button", { name: "Test step" }).click();
    await expect(app.getByText("Output", { exact: true })).toBeVisible();
    await expect(tick(app, "Call")).toBeVisible();
    await expect(app.getByText(/^Tested (just now|\dm ago)/)).toBeVisible();

    await canvasNode(app, "Use").click();
    await app.getByRole("button", { name: "Test step" }).click();
    await expect(app.getByText("Output", { exact: true })).toBeVisible();
    await expect(app.getByRole("alert")).toBeHidden();
    await expect(tick(app, "Use")).toBeVisible();
    await shot(app, "step-test-passed");

    await canvasNode(app, "Broken").click();
    await app.getByRole("button", { name: "Test step" }).click();
    await expect(app.getByRole("alert")).toBeVisible();
    await expect(badge(app, "Broken", "Failed")).toBeVisible();
    await shot(app, "step-test-badges");

    // The picker reads the last test, and brackets a dotted key.
    await canvasNode(app, "Use").click();
    const url = app.getByRole("textbox", { name: /URL/i });
    await url.click();
    await url.press("End");
    const popup = app.locator(".workflow-expression-popup");
    await expect(popup.getByText(/^from test \d/)).toBeVisible();
    await shot(app, "picker-from-test");

    await popup.getByPlaceholder("Search paths…").fill("content");
    await popup
      .getByRole("button", {
        name: /steps\.call\.output\.body\["content\.type"\]/,
      })
      .click();
    await expect(url).toHaveValue(
      /\{\{steps\.call\.output\.body\["content\.type"\]\}\}$/,
    );

    // The edit makes the step's last test stale.
    await url.blur();
    await expect(badge(app, "Use", "Test me")).toBeVisible();
  });
});
