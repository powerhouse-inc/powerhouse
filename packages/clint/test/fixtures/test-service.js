#!/usr/bin/env node
/**
 * Configurable test service for ServiceManager tests.
 *
 * Modes (set via TEST_SERVICE_MODE env var):
 *   ready       — prints readiness pattern and stays alive (default)
 *   crash       — prints readiness pattern, then exits after CRASH_DELAY ms
 *   slow        — waits READY_DELAY ms before printing readiness
 *   no-ready    — never prints readiness pattern, stays alive
 *   immediate   — prints readiness and exits immediately
 *   vetra       — simulates Powerhouse Vetra startup (connect port, drive URL, MCP server)
 *   multi-partial — prints 2 of 3 patterns then stays alive (for timeout tests)
 *   exit-fast     — exits immediately with code 0, no readiness output (for "died before ready" tests)
 *   ignore-sigterm — traps SIGTERM, stays alive (only killable via SIGKILL, for force-kill tests)
 *
 * Env vars:
 *   TEST_SERVICE_MODE   — one of the modes above
 *   TEST_SERVICE_PORT   — port number to include in readiness message
 *   READY_DELAY         — ms to wait before printing readiness (slow mode)
 *   CRASH_DELAY         — ms to wait before crashing (crash mode)
 */

const mode = process.env.TEST_SERVICE_MODE || "ready";
const port = process.env.TEST_SERVICE_PORT || "0";
const readyDelay = parseInt(process.env.READY_DELAY || "0", 10);
const crashDelay = parseInt(process.env.CRASH_DELAY || "500", 10);

function printReady() {
  console.log(`Server listening on http://localhost:${port}`);
}

switch (mode) {
  case "ready":
    printReady();
    // Stay alive
    setInterval(() => {}, 60_000);
    break;

  case "crash":
    printReady();
    setTimeout(() => {
      console.log("Crashing!");
      process.exit(1);
    }, crashDelay);
    // Stay alive until crash
    setInterval(() => {}, 60_000);
    break;

  case "slow":
    setTimeout(() => {
      printReady();
      // Stay alive after ready
      setInterval(() => {}, 60_000);
    }, readyDelay);
    break;

  case "no-ready":
    console.log("Started but never ready");
    setInterval(() => {}, 60_000);
    break;

  case "immediate":
    printReady();
    // Exit immediately
    break;

  case "vetra":
    // Simulate Powerhouse Vetra startup sequence
    console.log("Starting Vetra development server...");
    setTimeout(() => {
      console.log(`  Local:   http://localhost:${port}`);
    }, 50);
    setTimeout(() => {
      console.log(`  Drive URL: http://localhost:${port}/drives/main`);
    }, 100);
    setTimeout(() => {
      console.log(`  MCP server available at http://localhost:${port}/mcp`);
    }, 150);
    // Stay alive
    setInterval(() => {}, 60_000);
    break;

  case "multi-partial":
    // Print only 2 of 3 patterns — the third never appears (for timeout tests)
    console.log(`  Local:   http://localhost:${port}`);
    setTimeout(() => {
      console.log(`  Drive URL: http://localhost:${port}/drives/main`);
    }, 50);
    // MCP pattern never printed
    setInterval(() => {}, 60_000);
    break;

  case "exit-fast":
    // Exit immediately — no readiness output, for testing "process died before ready"
    console.log("Starting up...");
    process.exit(0);
    break;

  case "ignore-sigterm":
    // Trap SIGTERM so only SIGKILL can stop this process (for force-kill tests)
    process.on("SIGTERM", () => {
      console.log("SIGTERM received but ignoring");
    });
    printReady();
    setInterval(() => {}, 60_000);
    break;

  default:
    console.error(`Unknown mode: ${mode}`);
    process.exit(1);
}
