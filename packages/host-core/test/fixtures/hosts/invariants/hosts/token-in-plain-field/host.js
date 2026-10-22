// 3.5 a token in a field that is not token-able (`runner.host`).
export default {
  name: "inv-plain-field",
  runner: {
    module: "@powerhousedao/ph-cli/runners/connect",
    host: { $output: { host: "switchboard", path: ["origin"] } },
  },
};
