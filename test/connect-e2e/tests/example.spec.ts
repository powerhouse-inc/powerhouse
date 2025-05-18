import { expect, test } from "@playwright/test";
import request, { gql } from "graphql-request";
import { CONNECT_URL, REACTOR_URL } from "../playwright.config.js";

test.use({
  storageState: {
    cookies: [],
    origins: [
      {
        origin: "http://127.0.0.1:3000",
        localStorage: [
          { name: "/:display-cookie-banner", value: "false" },
          {
            name: "/:acceptedCookies",
            value: '{"analytics":true,"marketing":false,"functional":false}',
          },
        ],
      },
    ],
  },
});

test("has title", async ({ page }) => {
  await page.goto(CONNECT_URL);

  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle(/Powerhouse Connect/);
});

test("has local drive", async ({ page }) => {
  // Click on the local drive
  const localDrive = page.getByText("My Local Drive");
  await localDrive.click();

  // Expects page to have a heading with the name of Installation.
  await page.waitForURL("**/d/my-local-drive");
});

test("adds remote drive", async ({ page }) => {
  const response = await request(
    `${REACTOR_URL}/graphql`,
    gql`
      mutation Mutation($id: String, $name: String!, $slug: String) {
        addDrive(id: $id, name: $name, slug: $slug) {
          id
          name
          slug
        }
      }
    `,
    {
      id: "test",
      name: "test",
      slug: "test",
    },
  );
  expect(response).toStrictEqual({
    addDrive: {
      id: "test",
      name: "test",
      slug: "test",
    },
  });

  await page.goto(CONNECT_URL);

  // Click on the local drive
  const localDrive = page.getByText("My Local Drive");
  await localDrive.click();

  // Expects page to have a heading with the name of Installation.
  await page.waitForURL("**/d/my-local-drive");
});
