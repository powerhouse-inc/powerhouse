// @ts-check
// The connect host with the workflows plugin composed: the workflow package's
// UI tests build this one (packages/workflow/scripts/ui-stack.ts).
import connect from "../connect/host.js";

/** @satisfies {PHHost} */
export default {
  ...connect,
  runner: {
    ...connect.runner,
    plugins: [
      ...connect.runner.plugins,
      { module: "@powerhousedao/connect/plugins/workflows" },
    ],
  },
};
