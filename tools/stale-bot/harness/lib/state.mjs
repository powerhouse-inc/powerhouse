/**
 * Runtime state for the vault harness.
 *
 * The vault is the record; this is the harness's own scratchpad for crash
 * recovery — what an interrupted run must remember to resume or to mark
 * BLOCKED. It holds only what the orchestrator (not the vault) owns: which
 * task is active and where its worktree is.
 *
 *   <stateDir>/state.json   { drive, active, lastRun, counts }
 *   <stateDir>/logs/        run logs + per-task audit dirs
 *   <stateDir>/worktrees/   one git worktree per active WBS goal
 */

import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export function expandHome(p) {
  return p && p.startsWith("~/") ? join(homedir(), p.slice(2)) : p;
}

export function nowIso() {
  return new Date().toISOString();
}

export const DEFAULT_STATE = {
  drive: null, // { slug, uuid } once detected
  // { type: "wbs", goalId, wbsId, scopeId, phase, round, worktree, base, branch, since } | null
  active: null,
  lastRun: null,
  counts: { completed: 0, blocked: 0, failed: 0 },
  // Ask mode: open questions awaiting a human answer, time-bound skips,
  // and permanent drops. Written nowhere but this file.
  parked: [],
  skipped: {},
  dropped: [],
};

export class State {
  constructor(stateDir) {
    this.dir = expandHome(stateDir);
    this.path = join(this.dir, "state.json");
    mkdirSync(join(this.dir, "logs"), { recursive: true });
    this.data = State.load(this.path);
  }

  static load(path) {
    try {
      const d = JSON.parse(readFileSync(path, "utf8"));
      return {
        ...DEFAULT_STATE,
        ...d,
        counts: { ...DEFAULT_STATE.counts, ...(d.counts || {}) },
      };
    } catch {
      return structuredClone(DEFAULT_STATE);
    }
  }

  save() {
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(this.path, JSON.stringify(this.data, null, 2) + "\n");
  }
}

/**
 * One line per transition to `<stateDir>/logs/<name>-<ts>.log`, and — when
 * echoing — to the console.
 *
 * Echoing is right for the CLI, where the console *is* the operator's window.
 * It is wrong in a session: the harness runs inside the OMP process, so
 * console output lands in the user's TUI and a normal run buries their
 * conversation. In-session callers pass `echo: false` and read the file (or
 * the supervisor's ring buffer) instead.
 *
 * @param {string} stateDir
 * @param {string} name                 log file prefix ("run", "gc")
 * @param {object} [opts]
 * @param {boolean} [opts.echo=true]    also write to the console
 * @param {(line: string) => void} [opts.sink=console.log]
 * @returns {(msg: string) => string}   the formatted line
 */
export function createLogger(
  stateDir,
  name,
  { echo = true, sink = console.log } = {},
) {
  const dir = expandHome(stateDir);
  let file = null;
  try {
    mkdirSync(join(dir, "logs"), { recursive: true });
    file = join(dir, "logs", `${name}-${nowIso().replace(/[:.]/g, "-")}.log`);
  } catch {
    // an unwritable state dir must not stop the run before it starts
  }
  return (msg) => {
    const line = `[${nowIso()}] ${msg}`;
    if (echo) {
      try {
        sink(line);
      } catch {
        // a broken sink must never kill the loop
      }
    }
    if (file) {
      try {
        appendFileSync(file, line + "\n");
      } catch {
        // logging must never kill the loop
      }
    }
    return line;
  };
}
