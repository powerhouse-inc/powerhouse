import { command, flag } from "cmd-ts";

export const generateAllCmd = command({
  name: "all",
  description: "Re-generate all modules in the current project",
  args: {
    extract: flag({
      long: "extract",
      short: "x",
      description:
        "Instead of generating code, write a spec for every module into specs/ (one-shot migration to documents-as-source-of-truth)",
    }),
  },
  handler: async (args) => {
    const { startGenerateAll } = await import("../services/generate-all.js");
    await startGenerateAll(args, process.cwd());
    process.exit(0);
  },
});
