// The (valid) producer the negative fixtures read.
export default {
  name: "inv-switchboard",
  runner: {
    module: "@powerhousedao/ph-cli/runners/switchboard",
    plugins: ["@powerhousedao/switchboard/plugins/workflows"],
  },
  reactor: { drives: [{ slug: "inv" }] },
};
