// Canvas nodes take their logo from the piece catalog, and get it even when
// the first catalog request fails.
import {
  canvasNode,
  coreTrigger,
  createWorkflowInBrowser,
  openWorkflowEditor,
  pieceAction,
  waitServed,
} from "../../scripts/ui-stack.js";
import { expect, test } from "./fixtures.js";

test.describe("Canvas logos", () => {
  test("an HTTP step shows its logo after a failed first catalog load", async ({
    stack,
    app,
  }) => {
    const http = await pieceAction("@activepieces/piece-http", "send_request");
    const id = await createWorkflowInBrowser(app, stack.drive, {
      name: "Logos",
      enabled: false,
      trigger: { ...(await coreTrigger("manual")), config: {} },
      steps: [
        {
          key: "call",
          name: "Call",
          ...http,
          config: { method: "GET", url: "http://127.0.0.1:1/x" },
        },
      ],
    });
    await waitServed(id, "call");

    let failed = false;
    await app.route("**/graphql/workflow-runtime", async (route) => {
      const body = route.request().postData() ?? "";
      if (!failed && body.includes("pieceCatalog")) {
        failed = true;
        await route.fulfill({ status: 503, body: "unavailable" });
        return;
      }
      await route.fallback();
    });
    await app.reload();
    await openWorkflowEditor(app, "Logos");
    const logo = canvasNode(app, "Call").locator("img");
    await expect(logo).toBeVisible({ timeout: 15_000 });
    await expect(logo).toHaveAttribute("src", /^https?:\/\//);
  });
});
