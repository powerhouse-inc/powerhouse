// Half of a token cycle (see token-cycle).
export default {
  name: "inv-ping",
  runner: { module: "@powerhousedao/ph-cli/runners/connect" },
  reactor: {
    drives: [
      {
        slug: "pong",
        remote: { url: { $output: { host: "pong", path: ["origin"] } } },
      },
    ],
  },
};
