#!/usr/bin/env node

/**
 * Dummy process for ProcessManager tests.
 *
 * Usage: node test-process.js <mode>
 *
 * Modes:
 *   echo        — prints args to stdout, exits 0
 *   fail        — prints to stderr, exits 1
 *   stream      — prints numbered lines with a delay, exits 0
 *   long-run    — runs until killed (handles SIGTERM)
 *   ignore-term — ignores SIGTERM so timeout / SIGKILL is needed
 *   duration    — runs for DURATION_MS env var milliseconds, exits 0
 */

const mode = process.argv[2] || "echo";
const message = process.argv.slice(3).join(" ") || "hello";

switch (mode) {
  case "echo":
    console.log(message);
    process.exit(0);
    break;

  case "fail":
    console.error(message);
    process.exit(1);
    break;

  case "stream": {
    const lines = ["line-1", "line-2", "line-3"];
    let i = 0;
    const iv = setInterval(() => {
      if (i >= lines.length) {
        clearInterval(iv);
        process.exit(0);
      }
      console.log(lines[i]);
      i++;
    }, 20);
    break;
  }

  case "long-run":
    console.log("started");
    // Keep alive, but exit cleanly on SIGTERM
    process.on("SIGTERM", () => {
      console.log("stopping");
      process.exit(0);
    });
    // Prevent automatic exit
    setInterval(() => {}, 60_000);
    break;

  case "ignore-term":
    console.log("started");
    // Deliberately ignore SIGTERM to test force-kill
    process.on("SIGTERM", () => {
      console.log("ignoring SIGTERM");
    });
    setInterval(() => {}, 60_000);
    break;

  case "duration": {
    const ms = parseInt(process.env.DURATION_MS || "300", 10);
    console.log(`running for ${ms}ms`);
    setTimeout(() => {
      console.log("completed");
      process.exit(0);
    }, ms);
    break;
  }

  default:
    console.error(`unknown mode: ${mode}`);
    process.exit(1);
}
