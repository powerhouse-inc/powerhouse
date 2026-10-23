// 2.1 a remote backend needs `remote.url`.
export default {
  name: "inv-remote",
  runner: { module: "@powerhousedao/ph-cli/runners/connect" },
  reactor: { backends: { sb: { kind: "remote", remote: {} } } },
};
