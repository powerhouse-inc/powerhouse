// 2.1 reactor XOR children: a compound runner may not declare reactor.
export default {
  name: "inv-xor-compound",
  runner: { module: "@powerhousedao/host-core/runners/compound" },
  reactor: { drives: [{ slug: "inv" }] },
};
