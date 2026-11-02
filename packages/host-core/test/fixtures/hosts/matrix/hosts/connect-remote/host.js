// Cells: connect, remote client (a lone remote backend: no local store),
// `$concat` over an output, the workflows drive by output token on the
// Connect workflows plugin (browser-only: no Node contribution).
export default {
  name: "lab-connect-remote",
  runner: {
    module: "@powerhousedao/ph-cli/runners/connect",
    port: 3003,
    plugins: [
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
  reactor: {
    backends: {
      sb: {
        kind: "remote",
        remote: {
          url: {
            $concat: [
              { $output: { host: "switchboard", path: ["origin"] } },
              "/d/lab",
            ],
          },
        },
      },
    },
    drives: [
      {
        slug: "vetra",
        remote: {
          url: {
            $output: { host: "switchboard", path: ["drives", "vetra", "url"] },
          },
        },
      },
    ],
  },
};
