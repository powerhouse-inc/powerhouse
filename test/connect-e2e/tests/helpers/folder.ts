import { type Page, expect } from "@playwright/test";

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
  // Wait for the folder to be visible
  await page.waitForSelector(`text=${oldName}`);

  // Hover over the folder to make options visible
  await page.hover(`text=${oldName}`);

  // Click the options button (three dots)
  await page.click('button[aria-haspopup="menu"]');

  // Click Rename option
  await page.click("text=Rename");

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
  // Wait for the folder to be visible
  await page.waitForSelector(`text=${folderName}`);

  // Hover over the folder to make options visible
  await page.hover(`text=${folderName}`);

  // Click the options button (three dots)
  await page.click('button[aria-haspopup="menu"]');

  // Click Duplicate option
  await page.click("text=Duplicate");

  // Verify there are exactly 2 elements with the same name after duplication
  await expect(page.getByText(folderName)).toHaveCount(2);
}

/**
 * Helper function to delete a folder
 * @param page Playwright Page object
 * @param folderName Name of the folder to delete
 */
export async function deleteFolder(page: Page, folderName: string) {
  // Wait for the folder to be visible
  await page.waitForSelector(`text=${folderName}`);

  // Hover over the folder to make options visible
  await page.hover(`text=${folderName}`);

  // Click the options button (three dots)
  await page.click('button[aria-haspopup="menu"]');

  // Click Delete option
  await page.click("text=Delete");

  // Press Enter to confirm deletion
  await page.keyboard.press("Enter");

  // Verify the folder has been deleted
  await page.getByText(folderName).waitFor({ state: "detached" });
}
