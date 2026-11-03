// The AI tools' runtime: tools run outside any editor, so each call names the
// switchboard it asks. Editors never import this: each one gets its own client
// from RuntimeProvider.
import type { BlockRef } from "@powerhousedao/pieces-framework/block-type";
import type { SwitchboardEntry } from "@powerhousedao/reactor-browser";
import {
  createRuntimeClient,
  workflowRuntimeUrl,
  type RuntimeClient,
  type RuntimeClientOptions,
} from "./runtime-client.js";
import {
  blockFormQuery,
  catalogQuery,
  createRuntimeQueryClient,
} from "./runtime-queries.js";

export type * from "./runtime-client.js";

// Keys start with the URL, so every switchboard has its own entries.
const queries = createRuntimeQueryClient();

/** One switchboard's runtime, for one tool call. */
export interface AiRuntime {
  switchboard: SwitchboardEntry;
  client: RuntimeClient;
  getBlockForm(block: BlockRef): ReturnType<typeof fetchBlockForm>;
  fetchPieceCatalog(): ReturnType<typeof fetchCatalog>;
}

function fetchBlockForm(client: RuntimeClient, block: BlockRef) {
  return queries.fetchQuery(blockFormQuery(client, block));
}

function fetchCatalog(client: RuntimeClient) {
  return queries.fetchQuery(catalogQuery(client));
}

/** The runtime of `switchboard`; the catalog and block forms are cached per URL. */
export function runtimeAt(
  switchboard: SwitchboardEntry,
  options: RuntimeClientOptions = {},
): AiRuntime {
  const client = createRuntimeClient(workflowRuntimeUrl(switchboard), options);
  return {
    switchboard,
    client,
    getBlockForm: (block) => fetchBlockForm(client, block),
    fetchPieceCatalog: () => fetchCatalog(client),
  };
}
