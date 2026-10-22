// 2.1 a token's path must exist in its producer's outputsSchema.
export default {
  name: "inv-token-path",
  runner: { module: "@powerhousedao/ph-cli/runners/connect" },
  reactor: {
    drives: [
      {
        slug: "workflows",
        remote: {
          url: {
            $output: {
              host: "switchboard",
              path: ["drives", "workflows", "uri"],
            },
          },
        },
      },
    ],
  },
};
