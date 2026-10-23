// 2.1 backend `kind` is required (no silent in-process default).
export default {
  name: "inv-kind",
  runner: { module: "@powerhousedao/ph-cli/runners/switchboard" },
  reactor: {
    backends: {
      main: { storage: { kind: "path", dataDir: "${userData}/.ph/store" } },
    },
  },
};
