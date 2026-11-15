import { resolve } from "node:path";

const BIN = resolve(import.meta.dirname, "../node_modules/.bin/switchboard");

/**
 * The command that starts the switchboard bin. Windows cannot spawn the bin
 * link, which is a shell script there, so Node runs the entry it points at.
 */
export const SWITCHBOARD_COMMAND: readonly [string, string[]] =
  process.platform === "win32"
    ? [
        process.execPath,
        [
          resolve(
            import.meta.dirname,
            "../node_modules/@powerhousedao/switchboard/dist/index.mjs",
          ),
        ],
      ]
    : [BIN, []];
