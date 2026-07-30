import { expect, test, type Page } from "@playwright/test";
import { SWITCHBOARD_URL } from "../playwright.config";

// The same flow as `document-flow.spec.ts`, signed in. Proves two things the
// unit tests cannot: that the client's signature survives the round trip to a
// real switchboard, and that the `prevOpHash` it stamps - recomputed from the
// document state with `hashDocumentStateForScope` - is the hash the server
// recorded for the preceding operation.

// The mock adapter signs with the well-known Anvil test account #0.
const MOCK_ADDRESS = "0xf39Fd6e51aaD88F6F4ce6aB8827279cffFb92266";

const OPERATIONS_QUERY = `
  query GetDocumentOperations($filter: OperationsFilterInput!) {
    documentOperations(filter: $filter) {
      items {
        index
        hash
        error
        action {
          id
          type
          scope
          context {
            signer {
              user {
                address
              }
              signatures
            }
          }
        }
      }
      totalCount
    }
  }
`;

type SignerContext = {
  user?: { address?: string };
  signatures?: string[];
};

type PushedAction = {
  id: string;
  type: string;
  scope: string;
  context?: {
    prevOpHash?: string;
    prevOpIndex?: number;
    signer?: SignerContext;
  };
};

async function addTodo(page: Page, title: string) {
  await page.getByTestId("todo-title").fill(title);
  await page.getByTestId("add-todo").click();
}

test("signs dispatched actions and stamps them with the previous operation hash", async ({
  page,
  request,
}) => {
  // Playwright's default per-test budget is 30s, which is less than the waits
  // below ask for on their own, so a slow sign-in used to fail this test before
  // its own 60s wait could elapse. Raised so the declared waits are reachable.
  //
  // Note this does NOT make wallet sign-in reliable: it degrades once the run
  // has written enough documents, because the switchboard's renown-credential
  // read model fails to index and retries forever (a pre-existing bug - see the
  // post-plan block in the plan's progress log). When it bites it hits whichever
  // spec signs in first, including the pre-existing renown-login spec.
  test.setTimeout(180_000);

  // The GraphQL API exposes no `prevOpHash` on `ActionContext`, so the stamped
  // value is read off the mutation the browser actually sent.
  const pushedActions: PushedAction[][] = [];
  page.on("request", (req) => {
    if (req.method() !== "POST" || !req.url().startsWith(SWITCHBOARD_URL)) {
      return;
    }
    const body = req.postData();
    if (!body?.includes("MutateDocumentWithOperations")) return;
    const parsed = JSON.parse(body) as {
      variables?: { actions?: PushedAction[] };
    };
    if (parsed.variables?.actions) pushedActions.push(parsed.variables.actions);
  });

  // Sign in first: the client resolves the signer off `window.ph.renown` at
  // push time, so it has to exist before the dispatch.
  await page.goto("/login");
  await page.getByRole("button", { name: "Connect a Wallet" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 60_000,
  });
  await expect(page.getByText("Signed in as")).toBeVisible({ timeout: 60_000 });

  await page.goto("/documents");
  const create = page.getByTestId("create-document");
  await expect(create).toBeEnabled();
  await create.click();

  const documentId = page.getByTestId("document-id");
  await expect(documentId).toHaveText(/^[0-9a-f-]{36}$/, { timeout: 30_000 });
  const id = await documentId.innerText();

  await addTodo(page, "sign this");
  await expect(page.getByTestId("todo-item")).toHaveText(["sign this"]);

  await addTodo(page, "and this");
  await expect(page.getByTestId("todo-item")).toHaveText([
    "sign this",
    "and this",
  ]);
  await expect(page.getByTestId("dispatch-error")).toHaveCount(0);

  // Both dispatches went out as signed, identified actions.
  expect(pushedActions).toHaveLength(2);
  const [first, second] = pushedActions.map((actions) => {
    expect(actions).toHaveLength(1);
    return actions[0];
  });
  for (const action of [first, second]) {
    expect(action.type).toBe("ADD_TODO");
    expect(action.context?.signer?.signatures?.length).toBeGreaterThan(0);
    expect(action.context?.signer?.user?.address?.toLowerCase()).toBe(
      MOCK_ADDRESS.toLowerCase(),
    );
  }

  // The global scope was empty for the first action and one operation deep for
  // the second, which is what the stamped indices have to say.
  expect(first.context?.prevOpIndex).toBe(-1);
  expect(second.context?.prevOpIndex).toBe(0);

  const response = await request.post(SWITCHBOARD_URL, {
    data: {
      query: OPERATIONS_QUERY,
      variables: { filter: { documentId: id, scopes: ["global"] } },
    },
  });
  expect(response.ok()).toBe(true);
  const body = (await response.json()) as {
    errors?: unknown;
    data: {
      documentOperations: {
        items: {
          index: number;
          hash: string;
          error: string | null;
          action: {
            id: string;
            type: string;
            context?: { signer?: SignerContext };
          };
        }[];
      };
    };
  };
  expect(body.errors).toBeUndefined();

  const operations = body.data.documentOperations.items;
  expect(operations).toHaveLength(2);
  expect(operations.map((operation) => operation.error)).toEqual([null, null]);
  expect(operations.map((operation) => operation.action.id)).toEqual([
    first.id,
    second.id,
  ]);

  // The signature the browser produced is the one the switchboard stored.
  for (const operation of operations) {
    const signer = operation.action.context?.signer;
    expect(signer?.signatures?.length).toBeGreaterThan(0);
    expect(signer?.user?.address?.toLowerCase()).toBe(
      MOCK_ADDRESS.toLowerCase(),
    );
  }

  // Hash conformance: op[n].action.context.prevOpHash === op[n-1].hash. This is
  // what proves the client's own `hashDocumentStateForScope` agrees with the
  // server's operation hashes.
  expect(second.context?.prevOpHash).toBe(operations[0].hash);
  expect(second.context?.prevOpIndex).toBe(operations[0].index);
});
