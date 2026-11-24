import type { ConnectDevPlugin } from "@powerhousedao/host-core";
import type { Plugin } from "vite";
import { devtoolsVitePlugin } from "../server/vite.js";

/**
 * `@powerhousedao/devtools/connect`: DevTools as a dev-server plugin of a
 * Connect host. The dev server lists it by default; a host turns it off with
 * `{ module: "@powerhousedao/devtools/connect", enabled: false }` in its
 * `runner.devPlugins`.
 */
const devtools: ConnectDevPlugin<Plugin> = {
  name: "devtools",
  appliesTo: "connect",
  hooks: {
    devServer: ({ projectRoot, run }) => [
      devtoolsVitePlugin({ projectRoot, run, client: "connect" }),
    ],
  },
};

export default devtools;
