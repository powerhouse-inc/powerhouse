import { vetraArgs } from "@powerhousedao/shared/clis/args";
import { command } from "cmd-ts";

export const vetra = command({
  name: "vetra",
  description: `
The vetra command sets up a Vetra development environment for working with Vetra projects.
It starts a Vetra Switchboard and optionally Connect Studio, enabling document collaboration 
and real-time processing with a "Vetra" drive or connection to remote drives.

This command:
1. Starts a Vetra Switchboard with a "Vetra" drive for document storage
2. Optionally connects to remote drives instead of creating a local drive
3. Starts Connect Studio pointing to the Switchboard for user interaction (unless disabled)
4. Enables real-time updates, collaboration, and code generation

Default drives:
Connect's default drives resolve to the Vetra drive (and the preview drive
when using --watch), plus any drives configured under
connect.drives.defaultDrives in powerhouse.config.json - de-duplicated by
URL, so configuring project drives does not cost you the Vetra drive.
An explicit --default-drives-url is appended to that list (de-duplicated);
it never replaces the Vetra drive.

Every drive on the local Switchboard:
Studio has no reactor of its own: it reads and writes on the local
Switchboard (connect.instance.reactorClient "remote"), so it lists every
drive there, such as one an agent adds through MCP, and a drive created in
Studio lands there too. Not with --remote-drive, or when the project sets
connect.instance.multiReactor or reactorClient itself.

Preview drive app:
Set vetra.previewDrive.app in powerhouse.config.json to the id of a drive
app, and ph vetra --watch opens the Vetra Preview drive in that app: it sets
the drive's app when it creates the drive and each time it starts. Without
the field the drive keeps the app it has.

One Vetra per project:
A running Vetra is recorded in .ph/vetra-runtime.json (its pid and the
Connect, Switchboard and MCP URLs); a second \`ph vetra\` prints those and
exits. --restart stops the recorded Vetra first, then starts this one.
Studio restarts by itself when powerhouse.config.json changes.
`,
  args: vetraArgs,
  handler: async (args) => {
    if (args.debug) {
      console.log(args);
    }
    const { startVetra } = await import("../services/vetra.js");
    await startVetra(args);
  },
});
