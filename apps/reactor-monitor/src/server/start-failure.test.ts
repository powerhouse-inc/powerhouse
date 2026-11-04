import { SPAWN_STOPPING_NOTE, SpawnHostError } from "@powerhousedao/host-core";
import { describe, expect, it } from "vitest";
import { PORT_TAKEN_TAIL } from "./__fixtures__/spawn-tails.ts";
import { failureReason, startFailure } from "./start-failure.ts";

const EXITED = { code: 1, signal: null, forced: false };

function exited(tail: string): SpawnHostError {
  return new SpawnHostError(
    "spawnHost: ph run cli exited (code 1) before writing its run record.",
    "exited",
    tail,
    EXITED,
  );
}

describe("startFailure", () => {
  it("leads with ph run's own failure line, past the native spam", () => {
    expect(startFailure(exited(PORT_TAKEN_TAIL))).toEqual({
      message: "Stopped while starting: Port 16347 is already in use.",
      phase: "exited",
      tail: PORT_TAKEN_TAIL,
      context: "ph run cli exited (code 1) before writing its run record.",
    });
  });

  it("takes the last Error: line of an uncaught crash", () => {
    const tail = [
      "file:///x/runner.js:12",
      "    throw new Error('first');",
      "          ^",
      "",
      "TypeError [ERR_INVALID_ARG]: The project has no hosts folder",
      "    at load (file:///x/runner.js:12:11)",
      "",
      "Node.js v24.13.0",
    ].join("\n");
    expect(startFailure(exited(tail)).message).toBe(
      "Stopped while starting: The project has no hosts folder.",
    );
  });

  it("falls back to the spawn sentence, without its prefix", () => {
    const timeout = new SpawnHostError(
      "spawnHost: ph run cli wrote no run record within 1000 ms.",
      "timeout",
      "",
      EXITED,
    );
    expect(startFailure(timeout)).toEqual({
      message:
        "Didn't finish starting: ph run cli wrote no run record within 1000 ms.",
      phase: "timeout",
      tail: "",
    });
    expect(failureReason("[sb] booting\n[08:00:00.00] [sb] ready\n")).toBe(
      undefined,
    );
  });

  it("names no cause for a healthy start log, only the spawn sentence", () => {
    const healthy = [
      "[connect] composition plan (verb=run): 2 active of 2 declared",
      "Port 6347 is in use, trying another one...",
      "  ➜  Local:   http://localhost:6348/",
      "{",
      '  "drives": ["powerhouse"]',
      "}",
    ].join("\n");
    const progress = healthy.split("\n").slice(0, 2).join("\n");
    for (const tail of [healthy, progress]) {
      expect(failureReason(tail)).toBe(undefined);
      expect(startFailure(exited(tail))).toEqual({
        message:
          "Stopped while starting: ph run cli exited (code 1) before writing its run record.",
        phase: "exited",
        tail,
      });
    }
  });

  it("names where a run that timed out stopped printing", () => {
    const stalled = [
      "[18:06:47.10] [reactor-api] Starting",
      "[18:06:48.54] [reactor-api][package-manager] Loading packages: /p, @powerhousedao/workflow",
      "{",
      '  "drives": ["powerhouse"]',
      "}",
      "",
    ].join("\n");
    const timeout = (tail: string) =>
      new SpawnHostError(
        "spawnHost: ph run desktop wrote no run record within 120000 ms.",
        "timeout",
        tail,
        EXITED,
      );
    expect(startFailure(timeout(stalled))).toEqual({
      message:
        'Didn\'t finish starting: its last output was "[18:06:48.54] [reactor-api][package-manager] Loading packages: /p, @powerhousedao/workflow".',
      phase: "timeout",
      tail: stalled,
      context: "ph run desktop wrote no run record within 120000 ms.",
    });
    expect(startFailure(timeout(PORT_TAKEN_TAIL)).message).toBe(
      'Didn\'t finish starting: its last output was "Port 16347 is already in use".',
    );
    expect(
      startFailure(timeout(`${stalled}onOutput: log buffer full\n`)).message,
    ).toContain("Loading packages");
    const esc = String.fromCharCode(27);
    expect(
      startFailure(
        timeout(
          `${esc}[32m[sb]${esc}[0m ${esc}[?25lDownloading 1%\rDownloading 97%\r\n  "a": 1\n},\n`,
        ),
      ).message,
    ).toBe('Didn\'t finish starting: its last output was "Downloading 97%".');
    expect(
      startFailure(
        timeout(
          `[sb] Loading packages: /p\n${SPAWN_STOPPING_NOTE}\n[sb] Shutdown complete\n`,
        ),
      ).message,
    ).toBe(
      'Didn\'t finish starting: its last output was "[sb] Loading packages: /p".',
    );
    const long = `[sb] ${"x".repeat(400)}`;
    expect(startFailure(timeout(long)).message).toBe(
      `Didn't finish starting: its last output was "${long.slice(0, 199)}…".`,
    );
  });

  it("leads with Connect's missing build when serve exits on it", () => {
    const tail = [
      "[connect] composition plan (verb=serve): 2 active of 2 declared",
      "[07:42:19.02] [switchboard][reactor] Shutdown complete",
      "No Connect build to serve: .ph/connect-build/dist/index.html is missing. Build it first with `ph connect build`, or `ph run <host> build` for a host's Connect.",
      "",
    ].join("\n");
    expect(startFailure(exited(tail)).message).toBe(
      "Stopped while starting: No Connect build to serve: .ph/connect-build/dist/index.html is missing. Build it first with `ph connect build`, or `ph run <host> build` for a host's Connect.",
    );
  });

  it("finds an uncaught error past its stack and properties", () => {
    const tail = [
      "Error: listen EADDRINUSE: address already in use :::16347",
      "    at Server.setupListenHandle (node:net:1940:16) {",
      "  code: 'EADDRINUSE',",
      "  port: 16347",
      "}",
      "",
      "Node.js v24.13.0",
    ].join("\n");
    expect(failureReason(tail)).toBe(
      "listen EADDRINUSE: address already in use :::16347",
    );
  });

  it("never headlines a progress or status line, even as the last one", () => {
    const catchUp = [
      "[connect] composition plan (verb=run): 2 active of 2 declared",
      "catch-up: reactor-drive-node-processor 0% · attachment-reference-read-model 0% · priority 2 dynamic",
      "memory allocation of 160 bytes failed",
      "skipping backtrace printing to avoid potential recursion",
      "memory allocation of 64 bytes failed",
    ].join("\n");
    for (const tail of [
      catchUp,
      "Switchboard listening on 4001",
      "drives: powerhouse, workflows",
    ]) {
      expect(failureReason(tail)).toBe(undefined);
      expect(startFailure(exited(tail)).message).toBe(
        "Stopped while starting: ph run cli exited (code 1) before writing its run record.",
      );
    }
    expect(failureReason("hosts/cli could not be loaded: no host.js")).toBe(
      "hosts/cli could not be loaded: no host.js",
    );
  });

  it("names a resolve failure past its indented continuation", () => {
    const reason =
      'hosts/assistant/host.js: assistant needs outputs from host "switchboard", which is not running. Start it first: ph run switchboard (or run a compound that includes it).';
    const tail = [
      reason,
      "  (needed by `reactor.backends.switchboard.remote.url`: $output switchboard › drives.powerhouse.url)",
      "",
    ].join("\n");
    expect(startFailure(exited(tail))).toEqual({
      message: `Stopped while starting: ${reason}`,
      phase: "exited",
      tail,
      context: "ph run cli exited (code 1) before writing its run record.",
    });
    const shared =
      'hosts/assistant/host.js: assistant needs outputs from host "switchboard", which runs as member "sb" of "cli" and member "sb" of "desktop"; stop all but one, or run switchboard on its own.';
    expect(
      failureReason(
        `${shared}\n  (needed by \`a\`: $output switchboard › origin)`,
      ),
    ).toBe(shared);
  });

  it("names nothing when a failure line opens an object dump", () => {
    const tail = ["hosts/cli could not be loaded {", '  "a": 1', "}"].join(
      "\n",
    );
    expect(failureReason(tail)).toBe(undefined);
  });

  it("names a line ending in a colon with its first detail", () => {
    const tail = [
      'hosts/connect/host.js failed validation against the hostSchema of "x":',
      "  - port: expected number",
      "  - name: required",
    ].join("\n");
    expect(failureReason(tail)).toBe(
      'hosts/connect/host.js failed validation against the hostSchema of "x": - port: expected number',
    );
  });

  it("names the resolver's other failures", () => {
    for (const reason of [
      "hosts/sb/host.js: reads $env FOO, which is not set. Set FOO in the environment.",
      'hosts/ui/host.js: reads $output sb › origin, but host "sb" has no output at origin.',
      "hosts/ui/host.js: is a malformed $output token.",
    ]) {
      expect(failureReason(`${reason}\n  (needed by \`a\`)`)).toBe(reason);
    }
  });
});
