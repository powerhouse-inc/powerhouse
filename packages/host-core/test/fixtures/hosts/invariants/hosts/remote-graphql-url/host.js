// A remote link is a drive address: `endpoints.graphql` is refused.
export default {
  name: "inv-remote-graphql",
  runner: { module: "@powerhousedao/ph-cli/runners/connect" },
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
