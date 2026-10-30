// A (valid) consumer the compound negatives compose.
export default {
  name: "inv-connect",
  runner: { module: "@powerhousedao/ph-cli/runners/connect" },
  reactor: {
    backends: {
      sb: {
        kind: "remote",
        remote: {
          url: {
            $output: { host: "switchboard", path: ["drives", "inv", "url"] },
          },
        },
      },
    },
  },
};
