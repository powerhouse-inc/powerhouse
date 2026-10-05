#!/usr/bin/env node
/**
 * Stale-bot — a standalone daily stale-issue sweeper for a GitHub repo.
 *
 * It is not an OMP plugin: a plain Node folder that shells out to `gh`
 * (GitHub) and `omp -p` (the drafter agent, headless). The decision math,
 * engagement scoring, caps, idempotency, and state live in
 * `harness/lib/sources/stale.mjs` (ported from the vault-harness); the agent
 * that writes the words is `agents/stale-bot.md`.
 *
 * Modes:
 *   node run.mjs --once               one sweep (drain candidates), exit
 *   node run.mjs --once --max-tasks N one sweep, at most N issues
 *   node run.mjs --once --dry-run     one sweep, drafts only, nothing posted
 *   node run.mjs --loop               sweep, sleep pollSeconds, repeat (resident)
 *   node run.mjs --status             print config + state, exit
 *   node run.mjs --help
 *
 * A sweep runs at most once per `stale.sweepEveryHours` (state-guarded), so a
 * daily cron and manual runs cannot double-post.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

import { createStaleSource } from "./harness/lib/sources/stale.mjs";
import {
  State,
  createLogger,
  expandHome,
  nowIso,
} from "./harness/lib/state.mjs";

const here = dirname(new URL(import.meta.url).pathname); // tools/stale-bot/

const HELP = `stale-bot — sweep a GitHub repo's quiet issues (stale / close / re-activate)

Usage:
  node run.mjs --once [--max-tasks N] [--dry-run]
  node run.mjs --loop
  node run.mjs --status
  node run.mjs --config <dir>   (default: this folder)
  node run.mjs --help

The bot decides mechanically (engagement score + quiet windows + caps) and a
headless drafter agent (agents/stale-bot.md) writes the comment it posts.
Every write is re-checked against live GitHub state before it is made, so
nothing is posted twice.`;

function parseArgs(argv) {
  const opts = {
    mode: "once",
    maxTasks: null,
    dryRun: false,
    status: false,
    help: false,
    config: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--once") opts.mode = "once";
    else if (a === "--loop") opts.mode = "loop";
    else if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--status") opts.status = true;
    else if (a === "--help" || a === "-h") opts.help = true;
    else if (a === "--config") {
      opts.config = argv[++i];
      if (!opts.config) throw new Error("--config needs a directory");
    } else if (a === "--max-tasks") {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n) || n < 1)
        throw new Error("--max-tasks needs a positive integer");
      opts.maxTasks = n;
    } else throw new Error(`unknown argument: ${a} (see --help)`);
  }
  return opts;
}

/**
 * Load config.json from <configDir> (default: this folder). A relative
 * `stateDir` is resolved against this folder so the tool runs the same from
 * anywhere.
 */
function loadConfig(configDir) {
  const dir = configDir ?? here;
  const path = join(dir, "config.json");
  if (!existsSync(path)) {
    throw new Error(
      `config.json not found in ${dir} — create one (see README.md)`,
    );
  }
  const cfg = JSON.parse(readFileSync(path, "utf8"));
  if (!cfg.stateDir) throw new Error("config.stateDir is required");
  if (!cfg.stateDir.startsWith("/") && !cfg.stateDir.startsWith("~")) {
    cfg.stateDir = join(here, cfg.stateDir); // relative to the tool's folder
  }
  cfg.pollSeconds =
    Number.isFinite(cfg.pollSeconds) && cfg.pollSeconds >= 1
      ? cfg.pollSeconds
      : 3600;
  if (!cfg.stale?.repo)
    throw new Error('config.stale.repo is not set (e.g. "owner/name")');
  return cfg;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(HELP);
    return;
  }

  let cfg;
  try {
    cfg = loadConfig(opts.config);
  } catch (e) {
    console.error(`error: ${e.message}`);
    process.exit(2);
  }
  if (opts.dryRun) cfg.stale = { ...cfg.stale, dryRun: true }; // CLI overrides the file

  const stateDir = expandHome(cfg.stateDir);
  const state = new State(stateDir);
  const log = createLogger(stateDir, "run");

  if (opts.status) {
    console.log(JSON.stringify({ config: cfg, state: state.data }, null, 2));
    return;
  }

  state.data.lastRun = nowIso();
  state.save();
  log(
    `stale-bot starting (mode=${opts.mode}, repo=${cfg.stale.repo}, ` +
      `${cfg.stale.dryRun ? "DRY RUN" : "live"})`,
  );

  const source = createStaleSource(cfg);

  try {
    source.startup(cfg, state, log);
  } catch (e) {
    log(`startup FAILED: ${e.message}`);
    process.exit(1);
  }

  const recovered = await source.recover(cfg, state, log);
  if (recovered) log(`recover: ${recovered.outcome}: ${recovered.detail}`);

  const signal = new AbortController().signal;
  const maxTasks = opts.maxTasks ?? cfg.maxTasksPerRun ?? null;

  const runSweep = async () => {
    let processed = 0;
    const skip = new Set();
    for (;;) {
      if (maxTasks !== null && processed >= maxTasks) break;
      const task = await source.selectNext({ state, cfg, skip, log });
      if (!task) break;
      const res = await source.process(task, { state, log, signal });
      processed += 1;
      log(
        `stale-bot: #${task.number} -> ${res.outcome}${res.detail ? ` (${res.detail})` : ""}`,
      );
      if (res.outcome === "failed") skip.add(task.id); // don't re-offer a failure this run
    }
    return processed;
  };

  if (opts.mode === "loop") {
    for (;;) {
      const processed = await runSweep();
      if (processed === 0) {
        log(`stale-bot: nothing to do — sleeping ${cfg.pollSeconds}s`);
        await sleep(cfg.pollSeconds * 1000);
      }
    }
  } else {
    const processed = await runSweep();
    log(`stale-bot finished (processed=${processed})`);
  }
}

// Only run when invoked as a program. Importing this module (e.g. for tests)
// must not start a sweep.
const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly)
  main().catch((e) => {
    console.error(`fatal: ${e.stack || e.message}`);
    process.exit(1);
  });
