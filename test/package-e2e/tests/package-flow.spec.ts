import { expect, test } from "@playwright/test";
import { CONNECT_URL, SWITCHBOARD_URL } from "../playwright.config.js";
import {
  createRemoteDrive,
  getDocumentOperations,
  graphql,
} from "./lib/graphql.js";

test.describe.configure({ mode: "serial" });

interface CreatedDoc {
  id: string;
  name: string;
}

test("package-flow: drive + document + edits propagate via switchboard", async ({
  page,
}) => {
  test.setTimeout(120_000);

  // ---- 1. Verify the published package was loaded into Switchboard. ----
  const models = await graphql<{
    documentModels: { items: { id: string; name: string }[] };
  }>(
    "/graphql",
    `
      {
        documentModels {
          items {
            id
            name
          }
        }
      }
    `,
  );
  const todoModel = models.documentModels.items.find(
    (m) => m.id === "test/todo",
  );
  expect(
    todoModel,
    `switchboard should have loaded the test/todo model from the published package`,
  ).toBeDefined();

  // ---- 2. Create a remote drive on Switchboard. ----
  const driveName = `E2E Drive ${Date.now()}`;
  const drive = await createRemoteDrive(driveName);
  console.log(`[test] created drive ${drive.id} → ${drive.url}`);

  // ---- 4. Create a Todo document on the drive via GraphQL. ----
  const created = await graphql<{
    Todo: { createDocument: CreatedDoc };
  }>(
    "/graphql/todo",
    `
      mutation CreateTodo($name: String!, $parent: String!) {
        Todo {
          createDocument(name: $name, parentIdentifier: $parent) {
            id
            name
          }
        }
      }
    `,
    { name: "Groceries", parent: drive.id },
  );
  const docId = created.Todo.createDocument.id;
  console.log(`[test] created todo document ${docId}`);

  // ---- 5. Dispatch a few action edits via the Todo subgraph. ----
  const todoIds = ["todo-1", "todo-2", "todo-3"];
  for (const [i, id] of todoIds.entries()) {
    await graphql(
      "/graphql/todo",
      `
        mutation Add($docId: PHID!, $input: Todo_AddTodoInput!) {
          Todo {
            addTodo(docId: $docId, input: $input) {
              id
            }
          }
        }
      `,
      { docId, input: { id, title: `Item ${i + 1}`, completed: false } },
    );
  }
  // NOTE: omit `title` (don't send `null`) — the codegen-emitted reducer on
  // this branch uses `!== undefined` instead of `!= null`, so passing null
  // overwrites the title with null and breaks the zod state validator that
  // Connect's editor runs in the browser.
  await graphql(
    "/graphql/todo",
    `
      mutation Update($docId: PHID!, $input: Todo_UpdateTodoInput!) {
        Todo {
          updateTodo(docId: $docId, input: $input) {
            id
          }
        }
      }
    `,
    {
      docId,
      input: { id: "todo-2", completed: true },
    },
  );
  await graphql(
    "/graphql/todo",
    `
      mutation Remove($docId: PHID!, $input: Todo_RemoveTodoInput!) {
        Todo {
          removeTodo(docId: $docId, input: $input) {
            id
          }
        }
      }
    `,
    { docId, input: { id: "todo-3" } },
  );

  // ---- 6. Verify GraphQL-dispatched operations propagated to Switchboard. ----
  // This is the "control" half: actions dispatched directly to Switchboard's
  // /graphql/todo subgraph must be readable via the operations query.
  const baselineOps = await getDocumentOperations(docId);
  const baselineTypes = baselineOps.map((o) => o.action.type);
  expect(
    baselineTypes,
    "GraphQL-dispatched ops should be recorded in order",
  ).toEqual(["ADD_TODO", "ADD_TODO", "ADD_TODO", "UPDATE_TODO", "REMOVE_TODO"]);

  // Spot-check one input round-trips intact.
  const firstAdd = baselineOps[0].action.input as {
    id: string;
    title: string;
    completed: boolean;
  };
  expect(firstAdd.id).toBe("todo-1");
  expect(firstAdd.title).toBe("Item 1");
  expect(firstAdd.completed).toBe(false);

  console.log(
    `[test] verified ${baselineOps.length} GraphQL-dispatched operations on ${docId}`,
  );

  // ---- 7. UI half: add the remote drive in Connect, edit via the todo
  // editor, and verify the new operation propagates to Switchboard. This is
  // the actual Connect → Switchboard roundtrip — the prior block only
  // exercised Switchboard's own storage. ----
  // Surface browser-side errors so we can debug install/sync issues.
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") {
      console.log(`[browser:${msg.type()}] ${msg.text()}`);
    }
  });
  page.on("pageerror", (err) => {
    console.log(`[pageerror] ${err.message}`);
  });

  await page.goto(CONNECT_URL);
  await page.waitForLoadState("networkidle");
  // Skeleton loader from the consumer scaffold can hang for a few seconds
  // while ph-packages.json fetches and React bootstraps.
  await page
    .locator(".skeleton-loader")
    .waitFor({ state: "hidden", timeout: 60_000 })
    .catch(() => {
      /* skeleton may not exist on the home view; ignore */
    });

  // Open the "Create New Drive" modal and switch to the remote/cloud tab.
  await page.getByText("Create New Drive").click();
  const modal = page.getByRole("dialog");
  await expect(modal).toBeVisible({ timeout: 10_000 });
  await modal.getByRole("tab", { name: /add drive/i }).click();

  // Fill in the remote URL — the modal debounces, fetches the REST endpoint,
  // and only marks the URL valid once that fetch resolves. We MUST wait for
  // that fetch before clicking "Add drive": the form's useEffect resets
  // `hasConfirmedUrl` to false whenever the debounced URL changes, so a
  // click that lands before the fetch settles gets reverted moments later
  // and the user ends up stuck on the first screen.
  const urlInput = modal.locator('input[placeholder="Drive URL"]');
  const fetchSettled = page.waitForResponse(
    (resp) => resp.url() === drive.url,
    { timeout: 15_000 },
  );
  await urlInput.fill(drive.url);
  await fetchSettled;
  const addDriveSubmit = modal.getByRole("button", { name: /^add drive$/i });
  await expect(addDriveSubmit).toBeEnabled({ timeout: 15_000 });
  await addDriveSubmit.click();

  // Confirmation step — the form now shows the resolved drive name and the
  // final "Add new drive" button.
  const confirmDriveButton = modal.getByRole("button", {
    name: /add new drive/i,
  });
  await expect(confirmDriveButton).toBeEnabled({ timeout: 15_000 });
  await confirmDriveButton.click();
  await modal.waitFor({ state: "hidden", timeout: 15_000 });

  // As soon as Connect adds the drive and starts syncing it, it discovers
  // a document of type `test/todo` whose package isn't yet loaded in this
  // browser session and pops a "Package Required" modal. That modal sits
  // on top of the home view, so we must accept the install BEFORE we can
  // click into the drive card. (This also exercises the browser-side
  // registry-fetch path — the real reason we removed `--local`.)
  const packageDialog = page.getByRole("dialog").filter({
    hasText: /Package Required/i,
  });
  if (
    await packageDialog
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(() => true)
      .catch(() => false)
  ) {
    console.log(
      "[test] Connect prompted to install test-todo-package; accepting",
    );
    await packageDialog.getByRole("button", { name: /^Install$/ }).click();
    await packageDialog.waitFor({ state: "hidden", timeout: 60_000 });
  }

  // Connect navigates into the remote drive once its initial sync lands.
  await expect(page).toHaveURL(/\/d\/[^/?]+/, { timeout: 30_000 });
  await page.waitForLoadState("networkidle");

  // The synced GraphQL-created doc surfaces as a clickable card.
  const docCard = page.getByText("Groceries", { exact: false }).first();
  await expect(docCard).toBeVisible({ timeout: 30_000 });
  await docCard.click();
  await page.waitForLoadState("networkidle");

  // Use our editor (fixtures/editor.tsx) to dispatch an ADD_TODO action.
  // The Connect reactor will sync it back to Switchboard.
  const newTodoInput = page.getByLabel("New todo title");
  await expect(newTodoInput).toBeVisible({ timeout: 30_000 });
  const uiTodoTitle = `ui-todo-${Date.now()}`;
  await newTodoInput.fill(uiTodoTitle);
  await page.getByRole("button", { name: "Add Todo" }).click();

  // Poll Switchboard for the new operation. Sync is usually fast (<2s) but
  // give it a wide window for slower hosts.
  await expect
    .poll(async () => (await getDocumentOperations(docId)).length, {
      timeout: 30_000,
      intervals: [500],
      message: "Connect should have synced one more operation to Switchboard",
    })
    .toBe(baselineOps.length + 1);
  const finalOps = await getDocumentOperations(docId);
  const lastOp = finalOps[finalOps.length - 1];
  expect(lastOp.action.type).toBe("ADD_TODO");
  const lastInput = lastOp.action.input as {
    title: string;
    completed: boolean;
  };
  expect(lastInput.title).toBe(uiTodoTitle);
  expect(lastInput.completed).toBe(false);

  console.log(
    `[test] UI-dispatched ADD_TODO("${uiTodoTitle}") synced to Switchboard ` +
      `(ops: ${baselineOps.length} → ${finalOps.length})`,
  );
  console.log(
    `[test] switchboard: ${SWITCHBOARD_URL}, connect: ${CONNECT_URL}`,
  );
});
