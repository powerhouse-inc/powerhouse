// Cell: an optional `$env` whose variable is unset omits its property.
export default {
  name: "lab-assistant-keyless",
  runner: { module: "@powerhousedao/clint/mastra-runner", port: 4911 },
  reactor: {
    backends: {
      switchboard: {
        kind: "remote",
        remote: {
          url: {
            $output: { host: "switchboard", path: ["drives", "lab", "url"] },
          },
        },
      },
    },
  },
  config: {
    apiKey: { $env: { name: "FIXTURE_UNSET_KEY", optional: true } },
  },
};
