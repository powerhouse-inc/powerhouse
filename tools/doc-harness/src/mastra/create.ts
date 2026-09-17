/**
 * Builds the Mastra instance: two workflows and a file-backed LibSQL store.
 * Kept apart from index.ts so importing the factory does not create the
 * default state DB; only Studio's entry does that.
 */
import { Mastra } from "@mastra/core";
import { LibSQLStore } from "@mastra/libsql";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { STATE_DIR } from "../lib/paths.js";
import { harnessRun } from "../workflows/harness-run.js";
import { taskRun } from "../workflows/task-run.js";

export function createMastra(stateDir: string = STATE_DIR) {
  mkdirSync(stateDir, { recursive: true });
  return new Mastra({
    workflows: { harnessRun, taskRun },
    storage: new LibSQLStore({
      id: "doc-harness",
      // Absolute: Studio's bundle resolves relative paths from its own cwd.
      url: `file:${path.resolve(stateDir, "harness.db")}`,
    }),
    logger: false,
  });
}
