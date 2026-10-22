import { command } from "cmd-ts";

export const generateHostsCmd = command({
  name: "hosts",
  description:
    "Generate hosts/<name>/outputs.js + outputs.d.ts (typed $output token trees) for every host whose runner declares outputs, and refresh hosts/types.d.ts. Rerun after changing a producer's runner or declared drives: a stale outputs.js fails the load.",
  args: {},
  handler: async () => {
    const { startGenerateHosts } =
      await import("../services/generate-hosts.js");
    const ok = await startGenerateHosts(process.cwd());
    process.exit(ok ? 0 : 1);
  },
});
