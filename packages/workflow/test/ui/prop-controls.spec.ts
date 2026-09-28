// Every prop type and layout hint PropertyForm renders, mounted over the live
// Connect page so the form runs with Connect's real styles.
import type { Page } from "@playwright/test";
import { CONNECT, ROOT } from "../../scripts/ui-stack.js";
import { expect, test } from "./fixtures.js";

async function mountHarness(page: Page, initial: Record<string, unknown> = {}) {
  await page.goto(CONNECT);
  await page.waitForLoadState("load");
  await page.evaluate(
    async ({ root, initial }) => {
      const harness = (await import(
        `/@fs${root}/packages/workflow/test/ui/harness/prop-controls.tsx`
      )) as { mount: (initial: Record<string, unknown>) => void };
      harness.mount(initial);
    },
    { root: ROOT, initial },
  );
  await page.getByTestId("config").waitFor();
}

async function config(page: Page): Promise<Record<string, unknown>> {
  return JSON.parse(
    (await page.getByTestId("config").textContent()) ?? "{}",
  ) as Record<string, unknown>;
}

test.describe("Prop controls", () => {
  test.beforeEach(async ({ page }) => {
    await mountHarness(page);
  });

  test("markdown notes are styled by variant", async ({ page }) => {
    for (const variant of ["INFO", "WARNING", "TIP", "BORDERLESS"]) {
      await expect(page.locator(`[data-variant="${variant}"]`)).toBeVisible();
    }
    await expect(page.locator('[data-variant="WARNING"]')).toContainText(
      "deletes",
    );
  });

  test("half-width fields share a row", async ({ page }) => {
    const first = await page
      .getByRole("textbox", { name: /First name/ })
      .boundingBox();
    const last = await page
      .getByRole("textbox", { name: /Last name/ })
      .boundingBox();
    expect(first && last && Math.abs(first.y - last.y) < 2).toBe(true);
    expect(first!.x).toBeLessThan(last!.x);
  });

  test("a checkbox reveals its fields while checked", async ({ page }) => {
    const channel = page.getByRole("textbox", { name: /Channel/ });
    await expect(channel).toBeHidden();
    await page.getByRole("switch", { name: /Notify/ }).click();
    await expect(channel).toBeVisible();
    await expect(page.getByRole("textbox", { name: /Mention/ })).toBeVisible();
  });

  test("numbers show their range and the stepper stays inside it", async ({
    page,
  }) => {
    const count = page.getByRole("textbox", { name: /^Count/ });
    await expect(count).toHaveAttribute("placeholder", "Between 0 and 10");
    await count.fill("20");
    await count.blur();
    await expect(page.getByText("Between 0 and 10.")).toBeVisible();

    // Clamped at the declared max, where the button stops.
    const increase = page.getByRole("button", { name: "Increase" });
    for (let i = 0; i < 5; i++) await increase.click();
    await expect(increase).toBeDisabled();
    await expect
      .poll(() => config(page))
      .toMatchObject({ count: 20, retries: 5 });
  });

  test("rich text follows its format sibling", async ({ page }) => {
    const content = page.getByText("Content", { exact: true }).locator("../..");
    await expect(content).toContainText("Plain text");
    await page.getByRole("combobox", { name: /Format/ }).click();
    await page.getByRole("option", { name: "HTML" }).click();
    await expect(content).toContainText("HTML");
  });

  test("cards, disabled static state and option descriptions", async ({
    page,
  }) => {
    await page.getByRole("radio", { name: /High/ }).click();
    await expect.poll(() => config(page)).toMatchObject({ priority: "high" });

    const region = page.getByRole("combobox", { name: /Region/ });
    await expect(region).toBeDisabled();
    await expect(region).toContainText("Connect an account first");

    await page.getByRole("combobox", { name: /Board/ }).click();
    await expect(
      page.getByRole("option", { name: /Roadmap.*12 cards/ }),
    ).toBeVisible();
  });

  test("a refreshOnSearch dropdown searches at the source", async ({
    page,
  }) => {
    await page.getByRole("combobox", { name: /User/ }).click();
    await expect(page.getByRole("option")).toHaveCount(1);
    await page.getByPlaceholder("Search").fill("grace");
    await expect(
      page.getByRole("option", { name: "Grace Hopper" }),
    ).toBeVisible();
    await expect(
      page.getByRole("option", { name: "Ada Lovelace" }),
    ).toBeHidden();
    await page.getByRole("option", { name: "Grace Hopper" }).click();
    await expect
      .poll(() => config(page))
      .toMatchObject({ user: "grace-hopper" });
    // The pick keeps its label though the unfiltered list doesn't hold it.
    const user = page.getByRole("combobox", { name: /User/ });
    await expect(user).toContainText("Grace Hopper");

    // Dismissing mid-search drops the results with the query.
    await user.click();
    await page.getByPlaceholder("Search").fill("alan");
    await expect(
      page.getByRole("option", { name: "Alan Turing" }),
    ).toBeVisible();
    await page.getByTestId("config").click();
    await user.click();
    await expect(page.getByPlaceholder("Search")).toHaveValue("");
    await expect(
      page.getByRole("option", { name: "Alan Turing" }),
    ).toBeHidden();
  });

  test("a date range commits a preset, or a custom pair", async ({ page }) => {
    await page.getByRole("radio", { name: "Last 7 days" }).click();
    await expect
      .poll(() => config(page))
      .toMatchObject({
        period: { preset: "last_7_days" },
      });
    await page.getByRole("radio", { name: "Custom" }).click();
    await expect(page.getByText("From", { exact: true })).toBeVisible();
    await page.getByRole("combobox", { name: /Window/ }).click();
    await page.getByRole("option", { name: "This month" }).click();
    await expect
      .poll(() => config(page))
      .toMatchObject({
        window: { preset: "this_month" },
      });
  });

  test("colour and custom values", async ({ page }) => {
    const colour = page.getByRole("textbox", { name: /Colour/ });
    await colour.fill("#ff0000");
    await colour.blur();
    const widget = page.getByRole("textbox", { name: /Widget/ });
    await widget.fill('{ "a": 1 }');
    await widget.blur();
    await expect
      .poll(() => config(page))
      .toMatchObject({
        colour: "#ff0000",
        widget: { a: 1 },
      });
  });

  test("tabs, sections, summary and the advanced fold", async ({ page }) => {
    await expect(page.getByRole("tab", { name: "To" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await page.getByRole("tab", { name: "Cc" }).click();
    await expect(page.getByRole("textbox", { name: /^Cc/ })).toBeVisible();

    const filters = page.getByRole("region", { name: "Filters" });
    await expect(filters).toContainText("Narrow what comes back");
    const assignee = filters.getByRole("textbox", { name: /Assignee/ });
    await assignee.fill("bob");
    await assignee.blur();
    const chips = page.getByLabel("Filters in use");
    await expect(chips).toContainText("Assignee: bob");
    await chips.getByRole("button", { name: "Clear Assignee" }).click();
    await expect(chips).toBeHidden();

    await expect(
      page.getByRole("button", { name: /More options/ }),
    ).toContainText("1 fields");
  });
});
