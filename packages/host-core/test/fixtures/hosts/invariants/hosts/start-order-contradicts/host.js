// 2.1 startOrder consistent with the output dependencies: connect consumes
// the switchboard's outputs, so it cannot start first.
export default {
  name: "inv-order-tokens",
  runner: { module: "@powerhousedao/host-core/runners/compound" },
  config: { startOrder: ["ui", "sb"] },
  children: {
    ui: { host: "connect" },
    sb: { host: "switchboard" },
  },
};
