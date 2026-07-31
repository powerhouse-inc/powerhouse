/**
 * The browser-safe entry point for the light GraphQL reactor client:
 * `@powerhousedao/reactor-browser/graphql-client`.
 *
 * Import from here rather than from the package root. The root barrel
 * re-exports the whole package, including modules that import
 * `@powerhousedao/reactor` as a value - and that package's entry reaches `pg`,
 * `@electric-sql/pglite` and `node:worker_threads`, none of which a browser
 * bundler can resolve. Nothing reachable from this entry imports the reactor as
 * a value, so it bundles in Next, Vite or anything else with no alias, stub or
 * other build config.
 *
 * Two rules keep it that way, both enforced by
 * `test/graphql-client/browser-entry.node.test.ts`:
 *
 *   1. Re-export from specific modules, never from a barrel. Going through
 *      `../hooks/index.js` instead of the two hook modules below pulls in more
 *      than twice the files and adds `@renown/sdk`, `zod` and `lz-string`.
 *   2. Import the reactor for types only. `../reactor-interop.js` mirrors the
 *      few runtime values that are actually needed.
 */

export * from "./index.js";

export {
  addPromiseState,
  DocumentCache,
  readPromiseState,
} from "../document-cache.js";
export { useAttachmentService } from "../hooks/attachment-service.js";
export {
  setDocumentCache,
  useDocument,
  useDocumentCache,
  useDocuments,
  useDocumentSafe,
  useGetDocument,
  useGetDocumentAsync,
  useGetDocuments,
} from "../hooks/document-cache.js";
export { useDispatch } from "../hooks/dispatch.js";
export type { DispatchFn, UseDispatchResult } from "../hooks/dispatch.js";
export {
  useDocumentModelModuleById,
  useDocumentModelModules,
} from "../hooks/document-model-modules.js";
export { setReactorClient, useReactorClient } from "../hooks/reactor.js";
export type { IReactorBrowserClient } from "../types/reactor-browser-client.js";
