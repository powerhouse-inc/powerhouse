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
});
