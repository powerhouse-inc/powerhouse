import { keyframesArgs } from "@powerhousedao/shared/clis/args";
import { command } from "cmd-ts";

export const keyframes = command({
  name: "keyframes",
  description: `
The keyframes command reports on and cleans up the keyframes of a running switchboard,
through its inspection-admin endpoint.

Prerequisites:
  - The host serves inspection-admin (INSPECTION_ADMIN_ENABLED=true).
  - The caller is one of the host's auth admins.
  - The keep rules are in powerhouse.config.json under reactor.keyframes, or in PH_KEYFRAMES.

Run preview first: it only reads. clean then removes the keyframes past each type's keep
count and all keyframes of deleted documents, in small paced statements beside live
traffic. Running it again is safe. A later read that misses a keyframe replays from the
operation log, so a clean-up costs time on cold reads and never changes a document.

The disk only shrinks after reclaim, which rewrites the Keyframe table once the store is
quiet. On PGlite the store answers nothing while it rewrites. On Postgres it says what to
run by hand.
`,
  args: keyframesArgs,
  handler: async (args) => {
    if (args.debug) {
      console.log(args);
    }
    const { runKeyframesCommand } = await import("../services/keyframes.js");
    const exitCode = await runKeyframesCommand(args);
    process.exit(exitCode);
  },
});
