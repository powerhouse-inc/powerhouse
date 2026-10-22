// 2.1 defaultVerb ⊆ runner verbs.
export default {
  name: "inv-verb",
  runner: {
    module: "@powerhousedao/ph-cli/runners/switchboard",
    defaultVerb: "start",
  },
};
