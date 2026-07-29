import { expect, test } from "@playwright/test";
import { SWITCHBOARD_URL } from "../playwright.config";

// Extensibility: the same client that serves the document hooks also binds a
// typed subgraph SDK and runs one-off documents, over the URL and auth the
// provider was configured with. The app configures one endpoint, not three.

test("reaches a subgraph and a one-off document through the same client", async ({
  page,
}) => {
  const requestedUrls: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/graphql")) {
      requestedUrls.push(request.url());
    }
  });

  await page.goto("/documents");

  const probe = page.getByTestId("probe-extensibility");
  await expect(probe).toBeEnabled();
  await probe.click();

  // `_service` exists on a subgraph endpoint and not on the supergraph, and the
  // SDL it answered with is the renown read model's own - so the request went
  // to `<base>/renown-read-model`, derived from the provider's `url`.
  await expect(page.getByTestId("subgraph-schema")).toHaveText(
    "renown-read-model",
    { timeout: 30_000 },
  );

  // A real typed query against that subgraph: nobody owns the zero address.
  await expect(page.getByTestId("subgraph-users")).toHaveText("0");

  // The one-off escape hatch, against the client's own endpoint.
  await expect(page.getByTestId("request-models")).toContainText("test/todo");

  await expect(page.getByTestId("probe-error")).toHaveCount(0);

  expect(requestedUrls).toContain(`${SWITCHBOARD_URL}/renown-read-model`);
  expect(requestedUrls).toContain(SWITCHBOARD_URL);
});
