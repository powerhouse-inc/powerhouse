// Cells: reactor runner (switchboard), standalone producer, `$env` storage
// dir, local drives incl. `projectHash: true` and `"id"`, a plugin-contributed
// drive (workflows), verb `run`.
import config from "../../powerhouse.config.json" with { type: "json" };

export default {
  name: "lab-switchboard",
  runner: {
    module: "@powerhousedao/ph-cli/runners/switchboard",
    port: config.reactor.port,
    plugins: [
      "@powerhousedao/switchboard/plugins/mcp",
      "@powerhousedao/switchboard/plugins/workflows",
    ],
  },
  reactor: {
    backends: {
      main: {
        kind: "in-process",
        storage: { kind: "path", dataDir: { $env: "FIXTURE_DATA_DIR" } },
      },
    },
    drives: [
      { slug: "lab", name: "Lab" },
      { slug: "vetra", name: "Vetra", projectHash: true },
      { slug: "shared", name: "Shared", projectHash: "id" },
    ],
  },
};
