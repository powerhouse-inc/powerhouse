import { expect, test } from "@playwright/test";

// The packages chain end to end: the page passes the REAL generated package
// (manifest, both todo versions, editors) to `GraphQLReactorProvider`, a
// StaticPackageManager publishes it into the `window.ph.vetraPackageManager`
// slot, `useDocumentModelModuleById` resolves the LATEST version (registry
// semantics), and the module's own `utils.createDocument` and typed action
// creators drive the same anonymous flow the switchboard accepts.

test("registers the app's document models and drives the flow through them", async ({
  page,
}) => {
  await page.goto("/documents");

  // The badge renders from useDocumentModelModules - the hook-chain proof.
  // The real package carries BOTH versions; the flow below runs on v2 because
  // the module hook resolves latest-first.
  await expect(page.getByTestId("model-registered")).toHaveText(
    "test/todo@1, test/todo@2",
  );

  // The create button is enabled only once useDocumentModelModuleById has
  // resolved the module, so everything below runs on the generated code.
  const create = page.getByTestId("create-document");
  await expect(create).toBeEnabled();
  await create.click();
  await expect(page.getByTestId("document-id")).toHaveText(/^[0-9a-f-]{36}$/, {
    timeout: 30_000,
  });

  await page.getByTestId("todo-title").fill("from the generated module");
  await page.getByTestId("add-todo").click();
  await expect(page.getByTestId("todo-item")).toHaveText([
    "from the generated module",
  ]);

  // The module-built document and the typed action both round-tripped without
  // a reducer or transport error.
  await expect(page.getByTestId("dispatch-error")).toHaveCount(0);
  await expect(page.getByTestId("demo-error")).toHaveCount(0);
});
