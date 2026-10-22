// 2.1 no old cross-host forms: `remote: { host }`.
export default {
  name: "inv-remote-host",
  runner: { module: "@powerhousedao/clint/mastra-runner" },
  reactor: {
    backends: {
      switchboard: { kind: "remote", remote: { host: "switchboard" } },
    },
  },
};
