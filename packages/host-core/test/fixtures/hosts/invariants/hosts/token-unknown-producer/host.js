// 2.1 a token's producer must exist.
export default {
  name: "inv-token-producer",
  runner: { module: "@powerhousedao/ph-cli/runners/connect" },
  reactor: {
    backends: {
      sb: {
        kind: "remote",
        remote: {
          url: {
            $output: { host: "switchbaord", path: ["drives", "inv", "url"] },
          },
        },
      },
    },
  },
};
