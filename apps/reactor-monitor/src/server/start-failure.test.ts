import { SpawnHostError } from "@powerhousedao/host-core";
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
    // A timeout's log is a run still going, never the cause.
    const timeout = new SpawnHostError(
      "spawnHost: ph run cli wrote no run record within 1000 ms.",
      "timeout",
      PORT_TAKEN_TAIL,
      EXITED,
    );
    expect(startFailure(timeout).message).toBe(
      "Didn't finish starting: ph run cli wrote no run record within 1000 ms.",
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
});
