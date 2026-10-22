// 2.1 no token cycle: ping reads pong's outputs and pong reads ping's.
export default {
  name: "inv-cycle",
  runner: { module: "@powerhousedao/host-core/runners/compound" },
  children: { ping: { host: "ping" }, pong: { host: "pong" } },
};
