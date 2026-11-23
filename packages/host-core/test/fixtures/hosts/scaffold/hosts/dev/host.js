// @ts-check
// `ph dev` (`ph run dev`) brings up the switchboard and Connect together in
// dev mode, as one supervised stack (generic compound): the switchboard loads
// the project's document models, processors and subgraphs from source, Connect
// its editors and apps, and both reload on a change. The drive lives in the
// switchboard; Connect is a remote client of it and keeps no store of its
// own. `ph run dev run` is the same stack without the dev tooling.
import connect from "../connect/host.js";

export default /** @satisfies {PHHost} */ ({
  name: "dev",

  runner: {
    module: "@powerhousedao/host-core/runners/compound",
    defaultVerb: "dev",
  },
  // No startOrder: the dev-connect member's output tokens start the
  // switchboard first (`ph run dev --explain outputs` prints the order).

  children: {
    // Inherits the switchboard host wholesale, including its drive.
    "dev-switchboard": { host: "switchboard" },

    "dev-connect": {
      host: "connect",
      runner: {
        plugins: [
          ...connect.runner.plugins,
          // Workflow Studio over the server's Workflows drive (its output).
          {
            module: "@powerhousedao/connect/plugins/workflows",
            config: {
              drive: {
                $output: {
                  host: "switchboard",
                  path: ["drives", "workflows", "url"],
                },
              },
            },
          },
        ],
      },
      // A first visit's cookie dialog would cover the local Connect, agents'
      // browsers included: off, unless powerhouse.config.json sets it.
      config: {
        ...connect.config,
        app: { cookieBanner: false, ...connect.config.app },
      },
      // Every URL is the switchboard member's output (what it actually
      // bound), so the compound starts it first.
      reactor: {
        // the override is a full statement: keep the connect host's protocol
        protocol: connect.reactor.protocol,
        backends: {
          // The switchboard, by the address of its powerhouse drive.
          sb: {
            kind: "remote",
            remote: {
              url: {
                $output: {
                  host: "switchboard",
                  path: ["drives", "powerhouse", "url"],
                },
              },
            },
          },
        },
        // Every drive the switchboard member serves, its declared ones and
        // the ones its plugins create, by the URL it reports (key-sorted).
        drives: {
          $map: {
            over: { $output: { host: "switchboard", path: ["drives"] } },
            to: { slug: { $key: true }, remote: { url: { $item: ["url"] } } },
          },
        },
      },
    },
  },
});
