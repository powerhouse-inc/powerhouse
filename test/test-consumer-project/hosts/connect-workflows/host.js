// @ts-check
// The connect host as the workflow package's UI tests need it
// (packages/workflow/scripts/ui-stack.ts): the workflows plugin composed, and
// the reactor in the page itself, where the tests reach its sync manager.
import connect from "../connect/host.js";

export default /** @satisfies {PHHost} */ ({
  ...connect,
  runner: {
    ...connect.runner,
    plugins: [
      ...connect.runner.plugins,
      { module: "@powerhousedao/connect/plugins/workflows" },
    ],
  },
  reactor: {
    ...connect.reactor,
    backends: { main: { kind: "in-process" } },
  },
});
