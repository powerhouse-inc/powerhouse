import { command } from "cmd-ts";

export const generateAllCmd = command({
  name: "all",
  description: "Re-generate all modules in the current project",
  args: {},
  handler: async () => {
    const { startGenerateAll } = await import("../services/generate-all.js");
    await startGenerateAll(process.cwd());
    process.exit(0);
  },
});
