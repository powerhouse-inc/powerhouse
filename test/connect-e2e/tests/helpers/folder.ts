import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * Helper function to create a new folder in the current drive
 * @param page Playwright Page object
 * @param folderName Name of the folder to create
 */
export async function createFolder(page: Page, folderName: string) {
  // Click on add new button
  await page.click("text=add new");

  // Fill the folder name and press Enter
  await page.fill('input[type="text"]', folderName);
  await page.keyboard.press("Enter");

  // Wait for the folder to be created and verify it exists under the Folders section
  const folderSection = page.getByText("Folders").locator("..");
  await folderSection.getByText(folderName).waitFor({ state: "visible" });
}

/**
 * Helper function to rename a folder
 * @param page Playwright Page object
 * @param oldName Current name of the folder
 * @param newName New name for the folder
 */
export async function renameFolder(
  page: Page,
  oldName: string,
  newName: string,
) {
  const folder = page.locator("[draggable=true]", {
    has: page.locator(`text=${oldName}`),
  });

  // Wait for the folder to be visible
  await folder.waitFor({ state: "visible" });

  // Hover over the folder to make options visible
  await folder.hover();

  // Click the options button (three dots)
  await folder.locator('button[aria-haspopup="menu"]').click();

  // Click Rename option
  await page.getByRole("menuitem", { name: "Rename" }).click();

  // Fill in the new name and press Enter
  await page.fill('input[type="text"]', newName);
  await page.keyboard.press("Enter");

  // Verify the renamed folder exists
  await page.locator(`text=${newName}`).waitFor({ state: "visible" });

  // Verify no elements with the old folder name exist in the DOM
  await page.getByText(oldName).waitFor({ state: "detached" });
}

/**
 * Helper function to duplicate a folder
 * @param page Playwright Page object
 * @param folderName Name of the folder to duplicate
 */
export async function duplicateFolder(page: Page, folderName: string) {
  const folder = page.locator("[draggable=true]", {
    has: page.locator(`text=${folderName}`),
  });

  // Wait for the folder to be visible
  await folder.waitFor({ state: "visible" });

  // Hover over the folder to make options visible
  await folder.hover();

  // Click the options button (three dots)
  await folder.locator('button[aria-haspopup="menu"]').click();

  // Click Duplicate option
  await page.getByRole("menuitem", { name: "Duplicate" }).click();

  // Verify there are exactly 2 elements with the same name after duplication
  await expect(page.getByText(folderName)).toHaveCount(2);
}

/**
 * Helper function to delete a folder
 * @param page Playwright Page object
 * @param folderName Name of the folder to delete
 */
export async function deleteFolder(page: Page, folderName: string) {
  const folder = page.locator("[draggable=true]", {
    has: page.locator(`text=${folderName}`),
  });

  // Wait for the folder to be visible
  await folder.waitFor({ state: "visible" });

  // Hover over the folder to make options visible
  await folder.hover();

  // Click the options button (three dots)
  await folder.locator('button[aria-haspopup="menu"]').click();

  // Click Delete option
  await page.getByRole("menuitem", { name: "Delete" }).click();

  // Press Enter to confirm deletion
  await page.getByText("Delete", { exact: true }).last().click();

  // Verify the folder has been deleted
  await page
    .getByText(folderName, { exact: true })
    .waitFor({ state: "detached" });
}
