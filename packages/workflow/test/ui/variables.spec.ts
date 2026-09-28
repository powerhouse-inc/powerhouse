import type { Page } from "@playwright/test";
import { openWorkflowEditor, type PhWindow } from "../../scripts/ui-stack.js";
import { expect, test } from "./fixtures.js";

interface Variable {
  key: string;
  value: unknown;
  type: string | null;
}

// The Daily digest document's global state, as the reactor holds it.
async function digestState(app: Page, id: string) {
  return app.evaluate(async (workflowId) => {
    const client = (window as unknown as PhWindow).ph!.reactorClientModule!
      .client;
    const document = (await client.get(workflowId)) as {
      state: { global: { variables: Variable[] } };
    };
    return document.state.global;
  }, id);
}

async function chooseType(app: Page, field: string, type: string) {
  await app.getByRole("combobox", { name: field }).click();
  await app.getByRole("option", { name: type, exact: true }).click();
}

test.describe("Typed variables", () => {
  test.beforeEach(async ({ app }) => {
    await openWorkflowEditor(app);
    await app.getByRole("button", { name: /Variables/ }).click();
  });

  test("a number variable takes numbers only", async ({ app, stack }) => {
    await app.getByRole("textbox", { name: "New variable name" }).fill("limit");
    await chooseType(app, "New variable type", "Number");
    const value = app.getByRole("textbox", { name: "New variable value" });
    const add = app.getByRole("button", { name: "Add", exact: true });
    await value.fill("0x10");
    await expect(app.getByText("Not a number")).toBeVisible();
    await expect(add).toBeDisabled();
    await value.fill("25");
    await add.click();

    await expect
      .poll(async () =>
        (await digestState(app, stack.seeded.digest)).variables.find(
          (variable) => variable.key === "limit",
        ),
      )
      .toMatchObject({ value: 25, type: "NUMBER" });
    await expect(
      app.getByRole("combobox", { name: "Type of limit" }),
    ).toContainText("Number");

    // An edit that isn't a number is refused, not converted.
    const row = app.getByRole("textbox", { name: "Value of limit" });
    await row.fill("twenty");
    await row.blur();
    await expect(app.getByText("Not a number")).toBeVisible();
    expect(
      (await digestState(app, stack.seeded.digest)).variables.find(
        (variable) => variable.key === "limit",
      )?.value,
    ).toBe(25);
  });

  test("a secret variable keeps only its reference", async ({ app, stack }) => {
    await app
      .getByRole("textbox", { name: "New variable name" })
      .fill("api_token");
    await chooseType(app, "New variable type", "Secret");
    await app.getByRole("button", { name: "Add", exact: true }).click();

    const secret = app.getByLabel("Value of api_token");
    await expect(secret).toHaveAttribute("type", "password");
    await secret.fill("s3cr3t-value");
    await secret.press("Enter");

    await expect
      .poll(async () =>
        (await digestState(app, stack.seeded.digest)).variables.find(
          (variable) => variable.key === "api_token",
        ),
      )
      .toMatchObject({
        type: "SECRET",
        value: expect.stringMatching(/^secret:\/\/v1:/),
      });
    await expect(app.getByText("version 1")).toBeVisible();
    // The value went to the secret store; the document never saw it.
    const state = await digestState(app, stack.seeded.digest);
    expect(JSON.stringify(state)).not.toContain("s3cr3t-value");
  });
});
