// Half of a token cycle (see token-cycle).
export default {
  name: "inv-pong",
  runner: { module: "@powerhousedao/ph-cli/runners/connect" },
  reactor: {
    drives: [
      {
        slug: "ping",
        remote: { url: { $output: { host: "ping", path: ["origin"] } } },
      },
    ],
  },
};
