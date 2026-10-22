// 2.1 no old cross-host forms: `{ from, slug }` drive references.
export default {
  name: "inv-from-slug",
  runner: {
    module: "@powerhousedao/ph-cli/runners/connect",
    plugins: [
      {
        module: "@powerhousedao/connect/plugins/workflows",
        config: { drive: { from: "switchboard", slug: "workflows" } },
      },
    ],
  },
};
