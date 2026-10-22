// @ts-check
// `ph run cli` brings up the switchboard + Connect together as one
// supervised stack (generic compound). The drive lives in the switchboard;
// Connect runs as a pure REMOTE CLIENT of it — a lone remote backend makes
// reactorClient "remote", so this Connect builds NO local reactor and never
// downloads PGlite. (Contrast desktop, where Connect takes the same drive as
// a SYNCHRONIZED remote drive — a local replica, which keeps PGlite by
// design. remote client = no local store; synchronized remote drive = local
// store.) Standalone `ph run connect` is untouched — still a local reactor.
import switchboard from "../switchboard/host.js";

// The drive(s) the switchboard serves, and its port — the single source
// Connect's remote attachment derives from.
const serverPort = switchboard.runner.port;
const serverDrives = switchboard.reactor.drives ?? [];

export default {
  name: "cli",

  // run → each member starts at "run": switchboard = server, Connect = studio
  // (no build step needed).
  runner: {
    module: "@powerhousedao/host-core/runners/compound",
  },

  config: {
    startOrder: ["cli-switchboard", "cli-connect"],
  },

  children: {
    // Inherits the switchboard host wholesale — including its drive.
    "cli-switchboard": { host: "switchboard" },

    // Connect as a remote client (full-statement reactor override; the
    // standalone connect host's own reactor is untouched). The lone remote
    // backend selects reactorClient "remote"; the remote default drive(s)
    // give the client the Switchboard URL to proxy to.
    "cli-connect": {
      host: "connect",
      reactor: {
        backends: {
          sb: {
            kind: "remote",
            remote: { url: `http://127.0.0.1:${serverPort}/graphql` },
          },
        },
        drives: serverDrives.map((drive) => ({
          slug: drive.slug,
          remote: { url: `http://127.0.0.1:${serverPort}/d/${drive.slug}` },
        })),
      },
    },
  },
};
