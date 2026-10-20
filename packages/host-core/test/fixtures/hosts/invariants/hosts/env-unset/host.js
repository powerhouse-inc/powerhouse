// 3.2 an unset (required) `$env` fails at resolve, naming the variable.
export default {
  name: "inv-env",
  runner: { module: "@powerhousedao/clint/mastra-runner" },
  config: { apiKey: { $env: "FIXTURE_NEVER_SET" } },
};
