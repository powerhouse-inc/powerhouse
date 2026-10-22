// 2.1 no `process.env` in host files: environment values go through $env.
export default {
  name: "inv-process",
  runner: { module: "@powerhousedao/clint/mastra-runner" },
  config: { apiKey: process.env.OPENROUTER_API_KEY ?? "none" },
};
