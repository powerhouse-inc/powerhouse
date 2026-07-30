import { expect, test, type Page } from "@playwright/test";

// The light GraphQL reactor client, anonymously: `GraphQLReactorProvider` fills
// the `window.ph` slots, `useReactorClient().create` writes a new todo document
// to the local switchboard, `useDocument` reads it back and `useDispatch` pushes
// actions to it. No reactor, no wallet, no session cookie.

async function addTodo(page: Page, title: string) {
  await page.getByTestId("todo-title").fill(title);
  await page.getByTestId("add-todo").click();
}

test("creates, reads and dispatches to a document anonymously", async ({
  page,
}) => {
  await page.goto("/documents");

  // The page is public: the auth gate does not bounce an anonymous visitor.
  await expect(page).toHaveURL(/\/documents/);

  const create = page.getByTestId("create-document");
  await expect(create).toBeEnabled();
  await create.click();

  // The created document's id is the demo's routing state, so a reload reads
  // it back from the switchboard rather than from memory.
  const documentId = page.getByTestId("document-id");
  await expect(documentId).toHaveText(/^[0-9a-f-]{36}$/, { timeout: 30_000 });
  const id = await documentId.innerText();
  await expect(page).toHaveURL(new RegExp(`\\?id=${id}$`));

  await expect(page.getByTestId("todo-document")).toBeVisible();

  await addTodo(page, "buy milk");
  await expect(page.getByTestId("todo-item")).toHaveText(["buy milk"]);

  await addTodo(page, "walk the dog");
  await expect(page.getByTestId("todo-item")).toHaveText([
    "buy milk",
    "walk the dog",
  ]);

  // An unsigned push is accepted: no action carried a reducer or transport error.
  await expect(page.getByTestId("dispatch-error")).toHaveCount(0);
  await expect(page.getByTestId("demo-error")).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId("todo-item")).toHaveText(
    ["buy milk", "walk the dog"],
    { timeout: 30_000 },
  );
});
