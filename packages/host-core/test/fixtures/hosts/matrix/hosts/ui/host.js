// A connect host in a folder NOT named "connect": member roles come from the
// runner, not the folder. Standalone it reads the (one) switchboard.
export default {
  name: "lab-ui",
  runner: { module: "@powerhousedao/ph-cli/runners/connect", port: 3005 },
  reactor: {
    backends: {
      sb: {
        kind: "remote",
        remote: {
          url: {
            $output: { host: "switchboard", path: ["endpoints", "graphql"] },
          },
        },
      },
    },
  },
};
