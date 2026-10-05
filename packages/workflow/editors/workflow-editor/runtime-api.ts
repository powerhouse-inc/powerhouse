// Ambient runtime client for the AI tools, which run outside any editor.
// Editors never import this: each one gets its own client from RuntimeProvider.
import type { BlockRef } from "@powerhousedao/pieces-framework/block-type";
import {
  createRuntimeClient,
  DEFAULT_RUNTIME_URL,
  type RunsScope,
  type RuntimeClient,
} from "./runtime-client.js";
import {
  blockFormQuery,
  catalogQuery,
  createRuntimeQueryClient,
} from "./runtime-queries.js";

export type * from "./runtime-client.js";
export { DEFAULT_RUNTIME_URL };

let ambient: RuntimeClient = createRuntimeClient(DEFAULT_RUNTIME_URL);
// Keys start with the URL, so switching runtimes needs no cache reset.
const ambientQueries = createRuntimeQueryClient();

export function setRuntimeUrl(url: string): void {
  if (url !== ambient.url) ambient = createRuntimeClient(url);
}

export const getBlockForm = (block: BlockRef) =>
  ambientQueries.fetchQuery(blockFormQuery(ambient, block));
export const fetchPieceCatalog = () =>
  ambientQueries.fetchQuery(catalogQuery(ambient));
export const fetchPieceActions = (packageName: string) =>
  ambient.fetchPieceActions(packageName);
export const fetchPieceTriggers = (packageName: string) =>
  ambient.fetchPieceTriggers(packageName);
export const fetchConnections = () => ambient.fetchConnections();
export const checkConnection = (connectionId: string) =>
  ambient.checkConnection(connectionId);
export const fetchRuns = (scope?: RunsScope) => ambient.fetchRuns(scope);
export const fireWorkflow = (workflowId: string, payload?: unknown) =>
  ambient.fireWorkflow(workflowId, payload);
