// 2.1 plugin verbs[] ⊆ runner verbs (mastra exports run/serve/build, not
// its helper promptFromMessages).
export default {
  name: "inv-plugin-verb",
  runner: {
    module: "@powerhousedao/clint/mastra-runner",
    plugins: [{ module: "fixture-plugin", verbs: ["promptFromMessages"] }],
  },
};
