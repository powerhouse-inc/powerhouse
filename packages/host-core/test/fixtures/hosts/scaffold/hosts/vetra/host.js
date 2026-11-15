// @ts-check
// vetra is the GENERIC compound over the project's switchboard and connect
// members, each composed with the Vetra Studio plugins — there is no
// vetra-specific runner. Studio is verb-scoped: `ph run vetra dev` gets the
// Vite package loader + studio UI + codegen reload; `ph run vetra` (run) is
// the same stack headless. Members spread their sibling host's composition
// (full inclusion) and add studio.
// Requires @powerhousedao/vetra-studio in devDependencies (a versioned
// scaffold dev dependency, same as host-core/clint).
import config from "../../powerhouse.config.json" with { type: "json" };
import switchboard from "../switchboard/host.js";
import connect from "../connect/host.js";

/** @satisfies {PHHost} */
export default {
  name: "vetra",

  runner: {
    module: "@powerhousedao/host-core/runners/compound",
    defaultVerb: "dev",
  },

  children: {
    "vetra-switchboard": {
      host: "switchboard",
      runner: {
        plugins: [
          ...switchboard.runner.plugins,
          { module: "@powerhousedao/vetra-studio/switchboard", verbs: ["dev"] },
        ],
      },
      // The switchboard host's own drives plus the studio drives, declared
      // (projectHash keeps today's ids):
      reactor: {
        ...switchboard.reactor,
        drives: [
          ...(switchboard.reactor.drives ?? []),
          {
            slug: "vetra",
            name: "Vetra",
            projectHash: true,
            preferredEditor: "vetra-drive-app",
          },
          {
            slug: "vetra-preview",
            name: "Vetra Preview",
            projectHash: true,
            // Opens in the drive app powerhouse.config.json names
            // (vetra.previewDrive.app), when it names one.
            ...(config.vetra?.previewDrive?.app
              ? { preferredEditor: config.vetra.previewDrive.app }
              : {}),
          },
        ],
      },
    },
    "vetra-studio": {
      host: "connect",
      runner: {
        port: config.vetra?.connectPort ?? 3001,
        plugins: [
          ...connect.runner.plugins,
          { module: "@powerhousedao/vetra-studio/connect", verbs: ["dev"] },
          // The browser half of workflows: loads Workflow Studio and attaches
          // the Workflows drive the switchboard member serves (its output,
          // so the compound starts that member first).
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
      // A first visit's cookie dialog would cover the local Studio, agents'
      // browsers included: off, unless powerhouse.config.json sets it.
      config: {
        ...connect.config,
        app: { cookieBanner: false, ...connect.config.app },
      },
      // Studio has no reactor of its own: it is a remote client of the
      // switchboard member and opens on its Vetra drive. The drive's address
      // is that member's output, so the compound starts it first.
      reactor: {
        protocol: connect.reactor.protocol,
        backends: {
          sb: {
            kind: "remote",
            remote: {
              url: {
                $output: {
                  host: "switchboard",
                  path: ["drives", "vetra", "url"],
                },
              },
            },
          },
        },
        drives: [
          {
            slug: "vetra",
            remote: {
              url: {
                $output: {
                  host: "switchboard",
                  path: ["drives", "vetra", "url"],
                },
              },
            },
          },
        ],
      },
    },
  },
};
