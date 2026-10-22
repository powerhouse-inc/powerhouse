import type { PagedResults } from "@powerhousedao/reactor";
import type { PHDocument } from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { StrictMode, Suspense } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { DocumentCache } from "../src/document-cache.js";
import { ensurePHEventHandlers } from "../src/graphql-client/graphql-reactor-provider.js";
import { setDocumentCache } from "../src/hooks/document-cache.js";
import { useDocumentsOfType } from "../src/hooks/documents-of-type.js";
import type { IReactorBrowserClient } from "../src/types/reactor-browser-client.js";

const model = documentModelDocumentModelModule;

function named(name: string): PHDocument {
  const document = model.utils.createDocument();
  document.header.name = name;
  return document;
}

// Its type, but not its schema: written by another version of the model, say.
const broken = {
  ...named("Broken"),
  state: { global: { name: 42 } },
} as unknown as PHDocument;

/** A client serving `documents` a page at a time, as `find` does. */
function pagedClient(documents: PHDocument[]) {
  const find = (
    _search: unknown,
    _view: unknown,
    paging?: { cursor: string; limit: number },
  ): Promise<PagedResults<PHDocument>> => {
    const start = Number(paging?.cursor || 0);
    const limit = paging?.limit ?? documents.length;
    const end = start + limit;
    return Promise.resolve({
      results: documents.slice(start, end),
      options: { cursor: String(start), limit },
      nextCursor: end < documents.length ? String(end) : undefined,
    });
  };
  return {
    find,
    get: (id: string) =>
      Promise.resolve(documents.find((d) => d.header.id === id)!),
    subscribe: () => () => undefined,
  } as unknown as IReactorBrowserClient;
}

function Models() {
  const { documents, invalid, hasNextPage, loadNextPage } = useDocumentsOfType(
    model,
    { limit: 2 },
  );
  return (
    <div>
      <ul>
        {documents.map((d) => (
          <li key={d.header.id}>{d.header.name}</li>
        ))}
      </ul>
      <p data-testid="invalid">{invalid.length}</p>
      {hasNextPage && <button onClick={loadNextPage}>More</button>}
    </div>
  );
}

describe("useDocumentsOfType", () => {
  beforeEach(() => {
    window.ph = {};
    delete window.__phEventHandlersRegistered;
    ensurePHEventHandlers();
  });

  afterEach(() => {
    window.ph = {};
    delete window.__phEventHandlersRegistered;
  });

  it("suspends for the first page, then pages on, setting aside documents that fail the schema", async () => {
    setDocumentCache(
      new DocumentCache(pagedClient([named("Alpha"), broken, named("Gamma")])),
    );
    const screen = await render(
      <StrictMode>
        <Suspense fallback={<p>Loading</p>}>
          <Models />
        </Suspense>
      </StrictMode>,
    );

    await expect.element(screen.getByText("Alpha")).toBeVisible();
    await expect.element(screen.getByTestId("invalid")).toHaveTextContent("1");
    expect(screen.container.querySelectorAll("li")).toHaveLength(1);

    await screen.getByRole("button", { name: "More" }).click();
    await expect.element(screen.getByText("Gamma")).toBeVisible();
    expect(screen.container.querySelector("button")).toBeNull();
  });
});
