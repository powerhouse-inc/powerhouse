// @ts-check
// `ph run cli` brings up the switchboard + Connect together as one
// supervised stack (generic compound). The drive lives in the switchboard;
// Connect runs as a pure REMOTE CLIENT of it — a lone remote backend makes
// reactorClient "remote", so this Connect builds NO local reactor and never
// downloads PGlite. (Contrast desktop, where Connect takes the same drive as
// a SYNCHRONIZED remote drive — a local replica, which keeps PGlite by
// design. remote client = no local store; synchronized remote drive = local
// store.) Standalone `ph run connect` is untouched — still a local reactor.
import connect from "../connect/host.js";

/** @satisfies {PHHost} */
export default {
  name: "cli",

  // run → each member starts at "run": switchboard = server, Connect = studio
  // (no build step needed).
  runner: {
    module: "@powerhousedao/host-core/runners/compound",
  },
  // No startOrder: the cli-connect member's output tokens start the
  // switchboard first (`ph run cli --explain outputs` prints the order).

  children: {
    // Inherits the switchboard host wholesale — including its drive.
    "cli-switchboard": { host: "switchboard" },

    // Connect as a remote client (full-statement reactor override; the
    // standalone connect host's own reactor is untouched). The lone remote
    // backend selects reactorClient "remote"; the remote drives give the
    // client the Switchboard URL to proxy to.
    "cli-connect": {
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
      // Every URL is the switchboard member's output (what it actually
      // bound), so the compound starts it first.
      reactor: {
        // the override is a full statement: keep the connect host's protocol
        protocol: connect.reactor.protocol,
        backends: {
          sb: {
            kind: "remote",
            remote: {
              url: {
                $output: {
                  host: "switchboard",
                  path: ["endpoints", "graphql"],
                },
              },
            },
          },
        },
        // Every drive the switchboard member actually serves — its declared
        // ones and the ones its plugins create (workflows) — by the URL it
        // reports, in key-sorted order. (After `ph generate hosts`,
        // `{ $item: ["url"] }` is switchboard.drives.$item.url from
        // ../switchboard/outputs.js.)
        drives: {
          $map: {
            over: { $output: { host: "switchboard", path: ["drives"] } },
            to: { slug: { $key: true }, remote: { url: { $item: ["url"] } } },
          },
        },
      },
    },
  },
};
