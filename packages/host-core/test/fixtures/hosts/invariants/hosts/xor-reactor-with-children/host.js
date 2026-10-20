// 2.1 reactor XOR children: a reactor runner may not declare children.
export default {
  name: "inv-xor-reactor",
  runner: { module: "@powerhousedao/ph-cli/runners/switchboard" },
  children: { sb: { host: "switchboard" } },
};
