// The interval field against saves that echo back late, one by one.
import type { Page } from "@playwright/test";
import { openHarness } from "../../scripts/ui-stack.js";
import type { ScheduleHarness } from "./harness/schedule-builder.js";
import { expect, test } from "./fixtures.js";

const ECHO_MS = 300;

const interval = (every: number) => ({
  mode: "interval",
  every,
  unit: "minutes",
});

async function savedConfig(page: Page): Promise<unknown> {
  return JSON.parse(
    (await page.getByTestId("config").textContent()) ?? "{}",
  ) as unknown;
}

async function saved(page: Page): Promise<unknown> {
  const config = page.getByTestId("config");
  return (
    JSON.parse((await config.textContent()) ?? "{}") as { every?: unknown }
  ).every;
}

test.describe("Schedule builder", () => {
  test.beforeEach(async ({ page }) => {
    const mount = await openHarness<ScheduleHarness>(page, "schedule-builder");
    await mount({ config: interval(15), echoMs: ECHO_MS });
    await page.getByTestId("config").waitFor();
  });

  test("typing outruns its own saves", async ({ page }) => {
    const every = page.getByLabel("Every", { exact: true });
    await every.fill("");
    await every.pressSequentially("30");
    await expect(every).toHaveValue("30");
    // Each echo of an earlier keystroke leaves the field alone, even blurred.
    await every.blur();
    await expect.poll(() => saved(page)).toBe(3);
    await expect(every).toHaveValue("30");
    await expect.poll(() => saved(page)).toBe(30);
    await expect(every).toHaveValue("30");
  });

  test("an outside change shows while the field has focus", async ({
    page,
  }) => {
    const every = page.getByLabel("Every", { exact: true });
    await every.fill("4");
    await expect.poll(() => saved(page)).toBe(4);
    await page.evaluate((config) => {
      (
        window as unknown as { __setSchedule: (c: unknown) => void }
      ).__setSchedule(config);
    }, interval(45));
    await expect(every).toBeFocused();
    await expect(every).toHaveValue("45");
  });
});

test.describe("Schedule builder, changes made while a save is in flight", () => {
  test.beforeEach(async ({ page }) => {
    const mount = await openHarness<ScheduleHarness>(page, "schedule-builder");
    await mount({ config: interval(15), echoMs: ECHO_MS });
    await page.getByTestId("config").waitFor();
  });

  test("a unit picked right after typing keeps the typed interval", async ({
    page,
  }) => {
    const every = page.getByLabel("Every", { exact: true });
    await every.fill("30");
    await page.getByRole("combobox").filter({ hasText: "Minutes" }).click();
    await page.getByRole("option", { name: "Hours" }).click();
    await expect(every).toHaveValue("30");
    await expect
      .poll(() => savedConfig(page), { timeout: ECHO_MS * 10 })
      .toMatchObject({ every: 30, unit: "hours" });
    await expect(every).toHaveValue("30");
  });

  test("two days toggled quickly both stay", async ({ page }) => {
    await page.getByRole("radio", { name: "Weekly" }).click();
    await expect
      .poll(() => saved(page), { timeout: ECHO_MS * 10 })
      .toBe(undefined);
    const tuesday = page.getByRole("button", { name: "Tuesday" });
    const wednesday = page.getByRole("button", { name: "Wednesday" });
    const before = await tuesday.getAttribute("aria-pressed");
    await tuesday.click();
    await wednesday.click();
    await expect(tuesday).toHaveAttribute(
      "aria-pressed",
      before === "true" ? "false" : "true",
    );
    await expect(wednesday).toHaveAttribute("aria-pressed", "true");
    await page.waitForTimeout(ECHO_MS * 4);
    await expect(tuesday).toHaveAttribute(
      "aria-pressed",
      before === "true" ? "false" : "true",
    );
    await expect(wednesday).toHaveAttribute("aria-pressed", "true");
  });
});

test.describe("Schedule builder with coalesced saves", () => {
  test("an outside change after blur shows, with no echo left pending", async ({
    page,
  }) => {
    const mount = await openHarness<ScheduleHarness>(page, "schedule-builder");
    await mount({ config: interval(15), echoMs: ECHO_MS, coalesce: true });
    const every = page.getByLabel("Every", { exact: true });
    // 16 then back to 15: the saves coalesce, so the document never changes.
    await every.fill("16");
    await every.fill("15");
    await page.waitForTimeout(ECHO_MS * 2);
    await every.blur();
    await page.evaluate((config) => {
      (
        window as unknown as { __setSchedule: (c: unknown) => void }
      ).__setSchedule(config);
    }, interval(16));
    await expect(every).toHaveValue("16");
  });
});
