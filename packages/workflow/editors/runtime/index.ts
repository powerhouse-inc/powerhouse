/**
 * The standalone, React-free workflow-runtime data layer, surfaced as its own
 * package entry (`@powerhousedao/workflow/editors/runtime`).
 *
 * Workflow Studio's runtime client and its query-option factories reach the
 * `/graphql/workflow-runtime` subgraph with no dependency on the Connect-bound
 * view components (`WorkflowStudio`, `WorkflowHeader`, `RunsTable`) or on
 * `@powerhousedao/design-system`. This barrel re-exports exactly that slice so a
 * non-Connect consumer -- the Reactor Monitor's Workflows tab -- can read a
 * reactor's run history over the same contract the studio uses, passing its own
 * `token`/`fetch` rather than the ambient Renown token the client defaults to.
 *
 * Deliberately NOT re-exported: `useTestStep` and `testStepMutation` (the
 * React-hook mutation helpers), and every view component. The runtime-export
 * test asserts this entry's import graph pulls in neither the design system nor
 * a React view.
 */
export {
  createRuntimeClient,
  RuntimeRequestError,
  isSyncingError,
  fetchRuns,
  fetchRunsPage,
  fetchRun,
} from "../workflow-editor/runtime-client.js";
export type {
  RuntimeClient,
  RuntimeClientOptions,
  Transport,
  RunRecord,
  RunStepRecord,
  RunPage,
  RunsScope,
} from "../workflow-editor/runtime-client.js";
export {
  createRuntimeQueryClient,
  runsQuery,
  runPagesQuery,
  runQuery,
  runsOfPages,
} from "../workflow-editor/runtime-queries.js";
