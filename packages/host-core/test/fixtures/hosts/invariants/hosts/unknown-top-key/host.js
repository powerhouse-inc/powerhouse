// 2.1 unknown top-level keys: strict host object (`reactr` typo).
export default {
  name: "inv-typo",
  runner: { module: "@powerhousedao/ph-cli/runners/switchboard" },
  reactr: { drives: [{ slug: "inv" }] },
};
