// 2.1 no `undefined` values: the JSON round-trip gate.
const unset = [][0];
export default {
  name: "inv-undefined",
  runner: { module: "@powerhousedao/ph-cli/runners/connect", port: unset },
};
