// Cells: mastra runner, remote client of the switchboard, a required `$env`
// secret (set), verb `serve`.
export default {
  name: "lab-assistant",
  runner: {
    module: "@powerhousedao/clint/mastra-runner",
    defaultVerb: "serve",
    port: 4910,
  },
  reactor: {
    backends: {
      switchboard: {
        kind: "remote",
        remote: {
          url: {
            $output: { host: "switchboard", path: ["endpoints", "graphql"] },
          },
        },
      },
    },
  },
  config: {
    model: "openrouter/fixture/model",
    apiKey: { $env: "FIXTURE_API_KEY" },
  },
};
