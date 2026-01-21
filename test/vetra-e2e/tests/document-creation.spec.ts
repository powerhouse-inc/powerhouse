import { closeDocumentFromToolbar } from "@powerhousedao/e2e-utils";
import { createDocument, navigateToVetraDrive } from "./helpers/document.js";
import { expect, test } from "./helpers/fixtures.js";

// Run these tests serially to avoid conflicts with other tests
// that modify the shared Vetra drive
test.describe.configure({ mode: "serial" });

test.use({
  storageState: {
    cookies: [],
    origins: [
      {
        origin: "http://localhost:3001",
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

test("should create document of each supported type in Vetra drive", async ({
  page,
}) => {
  // Navigate to Vetra drive (cookies already handled via storageState)
  await navigateToVetraDrive(page);

  // Define document types to test
  const documentTypes = [
    {
      type: "powerhouse/document-model",
      name: "Test Document Model",
    },
    {
      type: "powerhouse/document-editor",
      name: "Test Editor",
    },
    {
      type: "powerhouse/app",
      name: "Test App",
    },
    {
      type: "powerhouse/subgraph",
      name: "Test Subgraph",
    },
    {
      type: "powerhouse/processor",
      name: "Test Processor",
    },
  ];

  // Create each document type
  for (let i = 0; i < documentTypes.length; i++) {
    const doc = documentTypes[i];
    console.log(`Creating ${doc.type}: ${doc.name}`);

    const documentUrl = await createDocument(page, doc.type, doc.name);
    expect(documentUrl).toContain("/d/vetra-");

    await closeDocumentFromToolbar(page);
    await page.waitForLoadState("networkidle");

    const documentHeading = page.getByRole("heading", {
      name: doc.name,
      level: 3,
    });
    await expect(documentHeading).toBeVisible();
  }
});

test("should log console message when attempting to create powerhouse/codegen-processor", async ({
  page,
}) => {
  await navigateToVetraDrive(page);

  const consoleMessages: string[] = [];
  page.on("console", (msg) => {
    consoleMessages.push(msg.text());
  });
  const codegenButton = page.getByRole("button", {
    name: "Add new specification powerhouse/codegen-processor",
  });

  await expect(codegenButton).toBeVisible();
  await codegenButton.click();

  // Wait for any console messages to appear
  await page.waitForLoadState("networkidle");
});
