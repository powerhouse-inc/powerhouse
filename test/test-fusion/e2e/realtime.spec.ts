import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { SWITCHBOARD_URL } from "../playwright.config";

// Realtime: a change written by somebody else reaches the open page over the
// `graphql-ws` `documentChanges` subscription. The page never reloads and never
// polls - the client's websocket invalidates the document cache, which is what
// re-renders `useDocument`.

const MUTATE_DOCUMENT = `
  mutation MutateDocument($identifier: String!, $actions: [ActionInput!]!) {
    mutateDocument(documentIdentifier: $identifier, actions: $actions) {
      id
      revisionsList {
        scope
        revision
      }
    }
  }
`;

/** Pushes an ADD_TODO straight to the switchboard, as another client would. */
async function addTodoOverHttp(
  request: APIRequestContext,
  identifier: string,
  title: string,
) {
  const response = await request.post(SWITCHBOARD_URL, {
    data: {
      query: MUTATE_DOCUMENT,
      variables: {
        identifier,
        actions: [
          {
            id: crypto.randomUUID(),
            type: "ADD_TODO",
            timestampUtcMs: new Date().toISOString(),
            input: { id: crypto.randomUUID(), title, completed: false },
            scope: "global",
          },
        ],
      },
    },
  });
  expect(response.ok()).toBe(true);
  const body = (await response.json()) as { errors?: unknown };
  expect(body.errors).toBeUndefined();
}

/** Creates a document through the demo and returns its id. */
async function createDocument(page: Page): Promise<string> {
  const create = page.getByTestId("create-document");
  await expect(create).toBeEnabled();
  await create.click();

  const documentId = page.getByTestId("document-id");
  await expect(documentId).toHaveText(/^[0-9a-f-]{36}$/, { timeout: 30_000 });
  await expect(page.getByTestId("todo-document")).toBeVisible();
  return documentId.innerText();
}

test("shows a change written by another client without reloading", async ({
  page,
  request,
}) => {
  await page.goto("/documents");
  const id = await createDocument(page);

  // A marker that survives a re-render but not a navigation, so asserting it at
  // the end proves the new items arrived without the page being reloaded.
  await page.evaluate(() => {
    document.title = "realtime-marker";
  });

  await addTodoOverHttp(request, id, "written elsewhere");

  await expect(page.getByTestId("todo-item")).toHaveText(
    ["written elsewhere"],
    {
      timeout: 20_000,
    },
  );

  await addTodoOverHttp(request, id, "and again");
  await expect(page.getByTestId("todo-item")).toHaveText(
    ["written elsewhere", "and again"],
    { timeout: 20_000 },
  );

  expect(await page.title()).toBe("realtime-marker");
  await expect(page.getByTestId("dispatch-error")).toHaveCount(0);
  await expect(page.getByTestId("demo-error")).toHaveCount(0);
});

test("keeps working when the subscriptions endpoint is unreachable", async ({
  page,
}) => {
  // Realtime is an enhancement, never a dependency: with every websocket
  // handshake refused the demo still creates, reads and dispatches. The route
  // handler never calls `connectToServer`, so the switchboard is never reached.
  await page.routeWebSocket("**/graphql/subscriptions", (ws) => ws.close());

  await page.goto("/documents");
  await createDocument(page);

  await page.getByTestId("todo-title").fill("still works");
  await page.getByTestId("add-todo").click();

  await expect(page.getByTestId("todo-item")).toHaveText(["still works"]);
  await expect(page.getByTestId("dispatch-error")).toHaveCount(0);
  await expect(page.getByTestId("demo-error")).toHaveCount(0);
});
