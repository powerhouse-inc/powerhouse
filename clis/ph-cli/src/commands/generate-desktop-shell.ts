import { debugArgs } from "@powerhousedao/shared/clis/args";
import { command, flag, option, optional, string } from "cmd-ts";

export const generateDesktopShellCmd = command({
  name: "desktop-shell",
  description:
    "Scaffold a builder-owned desktop identity (hosts/desktop/app.json + icon). " +
    "`ph run desktop dev|build` then projects it into a native Tauri shell — no Rust.",
  args: {
    name: option({
      type: optional(string),
      long: "name",
      short: "n",
      description:
        "Product name (window title + macOS app name). Default: the project's package name.",
    }),
    identifier: option({
      type: optional(string),
      long: "identifier",
      short: "i",
      description:
        "Reverse-DNS app identifier, e.g. com.acme.app. Default: inc.powerhouse.desktop.<project>.",
    }),
    force: flag({
      long: "force",
      short: "f",
      description:
        "Overwrite an existing app.json (protects edits by default).",
    }),
    ...debugArgs,
  },
  handler: async (args) => {
    const { startGenerateDesktopShell } =
      await import("../services/generate-desktop-shell.js");
    startGenerateDesktopShell(args, process.cwd());
    process.exit(0);
  },
});
