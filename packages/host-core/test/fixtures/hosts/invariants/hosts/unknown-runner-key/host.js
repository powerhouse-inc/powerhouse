// 2.1 unknown runner keys: each runner's `runner` block is strict.
export default {
  name: "inv-runner-typo",
  runner: {
    module: "@powerhousedao/ph-cli/runners/connect",
    strictPortt: true,
  },
};
