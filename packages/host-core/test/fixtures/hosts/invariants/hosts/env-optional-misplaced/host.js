// 3.2 `{ $env: { name, optional: true } }` is legal only as a property value.
export default {
  name: "inv-env-optional",
  runner: { module: "@powerhousedao/clint/mastra-runner" },
  config: {
    apiKey: {
      $concat: ["sk-", { $env: { name: "FIXTURE_KEY", optional: true } }],
    },
  },
};
