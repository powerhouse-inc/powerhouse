import {
  canvasNode,
  coreTrigger,
  createWorkflowInBrowser,
  openWorkflowEditor,
  shot,
  workflowState,
} from "../../scripts/ui-stack.js";
import { expect, test } from "./fixtures.js";

// Every test adds the documents it needs.
test.use({ seed: false });

interface TriggerState {
  trigger: { config: Record<string, unknown> };
}

test.describe("Webhook trigger form", () => {
  test("shows the fields its scheme uses, stores the scheme, and No label stores an empty prefix", async ({
    stack,
    app,
  }) => {
    const id = await createWorkflowInBrowser(app, stack.drive, {
      name: "Inbound hook",
      enabled: false,
      trigger: { ...(await coreTrigger("webhook")), config: {} },
      steps: [],
    });
    await openWorkflowEditor(app, "Inbound hook");
    await canvasNode(app, "Webhook").click();
    const config = async () =>
      (await workflowState<TriggerState>(app, id)).trigger.config;

    // None shows only the fields an unverified endpoint uses.
    const verification = app.getByRole("combobox", { name: /Verification/ });
    await expect(verification).toContainText("None");
    await app.getByRole("button", { name: /More options/ }).click();
    const signedOnly = [
      /Secret/,
      /^Header/,
      /Replay window/,
      /Hash/,
      /Digest encoding/,
      /Signature label/,
    ];
    for (const name of signedOnly) {
      await expect(app.getByText(name)).toHaveCount(0);
    }
    await expect(app.getByText(/Event id field/)).toBeVisible();
    await shot(app, "webhook-none");

    // Any edit writes the default the Verification field shows.
    await app.getByRole("combobox", { name: /Method/ }).click();
    await app.getByRole("option", { name: "Any" }).click();
    await expect.poll(config).toMatchObject({ methods: "ANY", scheme: "none" });

    await verification.click();
    await app.getByRole("option", { name: /^HMAC digest$/ }).click();
    await expect(app.getByRole("combobox", { name: /Hash/ })).toBeVisible();
    await expect(
      app.getByRole("combobox", { name: /Digest encoding/ }),
    ).toBeVisible();

    await verification.click();
    await app.getByRole("option", { name: /HMAC digest with a label/ }).click();
    await expect
      .poll(async () => (await config()).scheme)
      .toBe("hmac-prefixed");

    const label = app.getByRole("textbox", { name: /Signature label/ });
    await expect(label).toBeVisible();
    await app.getByRole("checkbox", { name: "No label" }).check();
    await expect.poll(async () => (await config()).prefix).toBe("");
    // The text box gives way while the label is off on purpose.
    await expect(label).toBeHidden();
    await shot(app, "webhook-no-label");

    await app.getByRole("checkbox", { name: "No label" }).uncheck();
    await expect.poll(async () => "prefix" in (await config())).toBe(false);
    await expect(label).toBeVisible();

    // Clearing an optional dropdown removes the key rather than storing "".
    await app.getByRole("combobox", { name: /Hash/ }).click();
    await app.getByRole("option", { name: "SHA-1" }).click();
    await expect.poll(async () => (await config()).algorithm).toBe("sha1");
    await app.getByRole("combobox", { name: /Hash/ }).click();
    await app.getByRole("button", { name: "Clear selection" }).click();
    await expect.poll(async () => "algorithm" in (await config())).toBe(false);
  });
});
