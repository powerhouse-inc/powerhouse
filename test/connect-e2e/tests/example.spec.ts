import { expect, test } from "@playwright/test";
import request, { gql } from "graphql-request";
import { CONNECT_URL, REACTOR_URL } from "../playwright.config.js";

test("has title", async ({ page }) => {
  await page.goto(CONNECT_URL);

  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle(/Powerhouse Connect/);
});

test("has local drive", async ({ page }) => {
  await page.goto(CONNECT_URL);

  await page.getByText("Accept configured cookies").click();

  // Click on the local drive
  const localDrive = page.getByText("My Local Drive");
  await localDrive.click();

  // Expects page to have a heading with the name of Installation.
  await page.waitForURL("**/d/my-local-drive");
});

test("adds remote drive", async ({ page }) => {
  await page.goto(`${REACTOR_URL}/graphql`);

  const response = await request(
    `${REACTOR_URL}/graphql`,
    gql`
      mutation Mutation($global: DocumentDriveStateInput!) {
        addDrive(global: $global) {
          id
          name
          slug
        }
      }
    `,
    {
      global: {
        id: "test",
        name: "test",
        slug: "test",
      },
    },
  );
  expect(response).toStrictEqual({});

  await page.getByText("Accept configured cookies").click();

  // Click on the local drive
  const localDrive = page.getByText("My Local Drive");
  await localDrive.click();

  // Expects page to have a heading with the name of Installation.
  await page.waitForURL("**/d/my-local-drive");
});
