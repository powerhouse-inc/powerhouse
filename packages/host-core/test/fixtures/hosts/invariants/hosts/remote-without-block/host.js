// 2.1 a remote backend needs `remote.url`, also when the `remote` block is
// missing altogether (the refinement on the backend schema).
export default {
  name: "inv-remote-no-block",
  runner: { module: "@powerhousedao/ph-cli/runners/connect" },
  reactor: { backends: { sb: { kind: "remote" } } },
};
