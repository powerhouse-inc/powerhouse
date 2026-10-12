// The step and trigger property form against saves that echo back late, one
// by one: each edit builds on the newest one sent.
import type { Page } from "@playwright/test";
import { openHarness } from "../../scripts/ui-stack.js";
import type {
  PropertyFormEchoHarness,
  SavedForm,
} from "./harness/property-form-echo.js";
import { expect, test } from "./fixtures.js";

const ECHO_MS = 300;

async function saved(page: Page): Promise<SavedForm> {
  return JSON.parse(
    (await page.getByTestId("saved").textContent()) ?? "{}",
  ) as SavedForm;
}

test.describe("Property form, edits made while saves are in flight", () => {
  test.beforeEach(async ({ page }) => {
    const mount = await openHarness<PropertyFormEchoHarness>(
      page,
      "property-form-echo",
    );
    await mount({ value: { format: "plain" }, echoMs: ECHO_MS });
    await page.getByTestId("saved").waitFor();
  });

  test("three quick edits all stay", async ({ page }) => {
    const title = page.getByRole("textbox", { name: /^Title/ });
    const enabled = page.getByRole("switch", { name: /Enabled/ });
    const format = page.getByRole("combobox", { name: /Format/ });
    await title.fill("Weekly");
    await title.blur();
    await enabled.click();
    // The title's echo has landed; the switch's is still in flight.
    await expect
      .poll(async () => (await saved(page)).value.title)
      .toBe("Weekly");
    await format.click();
    await page.getByRole("option", { name: "HTML" }).click();
    await expect
      .poll(async () => (await saved(page)).value, { timeout: ECHO_MS * 10 })
      .toEqual({ title: "Weekly", enabled: true, format: "html" });
    await expect(enabled).toBeChecked();
    await expect(format).toContainText("HTML");
    await expect(title).toHaveValue("Weekly");
    const modes = (await saved(page)).settings?.map((s) => s.prop).sort();
    expect(modes).toEqual(["enabled", "format", "title"]);
  });

  test("array items added quickly all stay", async ({ page }) => {
    const add = page.getByRole("button", { name: "Add item" });
    await add.click();
    await add.click();
    // The first echo has landed; the second is still in flight.
    await expect
      .poll(async () => (await saved(page)).value.items)
      .toEqual([{}]);
    await add.click();
    await expect
      .poll(async () => (await saved(page)).value.items, {
        timeout: ECHO_MS * 10,
      })
      .toEqual([{}, {}, {}]);
    await expect(page.getByText(/^Item \d$/)).toHaveCount(3);
  });

  test("an entry added while a save echoes stays", async ({ page }) => {
    const key = page.getByPlaceholder("Key");
    await page.getByRole("button", { name: "Add entry" }).click();
    await key.fill("accept");
    await page.getByPlaceholder("Value").fill("json");
    await page.getByPlaceholder("Value").blur();
    await page.getByRole("button", { name: "Add entry" }).click();
    await expect(key).toHaveCount(2);
    await expect
      .poll(async () => (await saved(page)).value.headers, {
        timeout: ECHO_MS * 10,
      })
      .toEqual({ accept: "json" });
    await page.waitForTimeout(ECHO_MS * 2);
    await expect(key).toHaveCount(2);
  });

  test("an outside change replaces what is shown", async ({ page }) => {
    const enabled = page.getByRole("switch", { name: /Enabled/ });
    const format = page.getByRole("combobox", { name: /Format/ });
    await enabled.click();
    await expect
      .poll(async () => (await saved(page)).value.enabled, {
        timeout: ECHO_MS * 10,
      })
      .toBe(true);
    await page.evaluate(
      (form) => {
        (window as unknown as { __setForm: (f: unknown) => void }).__setForm(
          form,
        );
      },
      { value: { format: "markdown" }, settings: null },
    );
    await expect(enabled).not.toBeChecked();
    await expect(format).toContainText("Markdown");
    // The next edit builds on the outside value.
    await enabled.click();
    await expect
      .poll(async () => (await saved(page)).value, { timeout: ECHO_MS * 10 })
      .toEqual({ format: "markdown", enabled: true });
  });
});
