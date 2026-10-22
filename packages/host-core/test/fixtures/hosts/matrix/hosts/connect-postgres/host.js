// Cell: postgres storage on a PROVISIONED (browser) backend. It passes the
// host schema; the provisioning projection rejects it (server-side only).
export default {
  name: "lab-connect-pg",
  runner: { module: "@powerhousedao/ph-cli/runners/connect", port: 3004 },
  reactor: {
    backends: {
      main: {
        kind: "in-process",
        storage: { kind: "postgres", url: "postgres://fixture@localhost/lab" },
      },
    },
  },
};
