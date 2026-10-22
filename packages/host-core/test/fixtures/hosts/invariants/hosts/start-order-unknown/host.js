// 2.1 startOrder ⊆ children.
export default {
  name: "inv-order-unknown",
  runner: { module: "@powerhousedao/host-core/runners/compound" },
  config: { startOrder: ["sb", "nope"] },
  children: { sb: { host: "switchboard" } },
};
