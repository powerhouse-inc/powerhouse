// Cells: postgres storage on a SERVER backend (accepted; only a provisioned
// reactor rejects it), verb `serve`.
export default {
  name: "lab-switchboard-pg",
  runner: {
    module: "@powerhousedao/ph-cli/runners/switchboard",
    defaultVerb: "serve",
    port: 4101,
  },
  reactor: {
    backends: {
      main: {
        kind: "in-process",
        storage: { kind: "postgres", url: "postgres://fixture@localhost/lab" },
      },
    },
  },
};
