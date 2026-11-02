// 2.1 a generated outputs.js must match its producer (hash).
import { outputs as switchboard } from "../switchboard/outputs.js";

export default {
  name: "inv-stale",
  runner: { module: "@powerhousedao/ph-cli/runners/connect" },
  reactor: {
    backends: {
      sb: { kind: "remote", remote: { url: switchboard.drives.inv.url } },
    },
  },
};
