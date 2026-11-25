import { describe, expect, it, vi } from "vitest";
import {
  STEER_PREFIX,
  STEER_THREAD_KEY,
  beginSteerableTurn,
  createSteerProcessor,
  drainSteers,
  endSteerableTurn,
  enqueueSteer,
  hasInFlightTurn,
  isSteerDelivered,
  type SteerProcessInputStepArgs,
} from "./steer.js";

function stepArgs(threadId: string | undefined, rotate = false) {
  const added: Array<{ role: string; content: string; source: string }> = [];
  const markResponseMessageBoundary = vi.fn();
  const rotateResponseMessageId = vi.fn(() => "next-id");
  const args: SteerProcessInputStepArgs = {
    requestContext: {
      get: (key: string) => (key === STEER_THREAD_KEY ? threadId : undefined),
    },
    messageList: {
      add: (message, source) => {
        added.push({ ...message, source });
      },
      markResponseMessageBoundary,
    },
    ...(rotate ? { rotateResponseMessageId } : {}),
  };
  return { args, added, markResponseMessageBoundary, rotateResponseMessageId };
}

describe("steer queue", () => {
  it("drains queued messages oldest first and empties the queue", () => {
    enqueueSteer("q-1", { id: "a", text: "first" });
    enqueueSteer("q-1", { id: "b", text: "second" });
    enqueueSteer("q-1", { id: "a", text: "first again" });
    expect(drainSteers("q-1")).toEqual([
      { id: "a", text: "first" },
      { id: "b", text: "second" },
    ]);
    expect(drainSteers("q-1")).toEqual([]);
  });

  it("tracks running turns per thread", () => {
    expect(hasInFlightTurn("q-2")).toBe(false);
    beginSteerableTurn("q-2");
    beginSteerableTurn("q-2");
    endSteerableTurn("q-2");
    expect(hasInFlightTurn("q-2")).toBe(true);
    endSteerableTurn("q-2");
    expect(hasInFlightTurn("q-2")).toBe(false);
    expect(hasInFlightTurn("q-3")).toBe(false);
  });
});

describe("steer processor", () => {
  it("the steer processor injects queued messages at the next step", () => {
    enqueueSteer("p-1", { id: "s1", text: "add a Ready column" });
    enqueueSteer("p-1", { id: "s2", text: "and make it blue" });
    const step = stepArgs("p-1", true);

    createSteerProcessor().processInputStep(step.args);

    expect(step.added).toEqual([
      {
        role: "user",
        content: `${STEER_PREFIX}add a Ready column`,
        source: "input",
      },
      {
        role: "user",
        content: `${STEER_PREFIX}and make it blue`,
        source: "input",
      },
    ]);
    expect(STEER_PREFIX).toBe(
      "Steering from the customer (apply now, confirm in one line): ",
    );
    // The reply so far is closed, so this step's output is stored after the steer.
    expect(step.markResponseMessageBoundary).toHaveBeenCalledTimes(1);
    expect(step.rotateResponseMessageId).toHaveBeenCalledTimes(1);
    expect(drainSteers("p-1")).toEqual([]);

    // Nothing queued: the next step is left alone.
    const next = stepArgs("p-1", true);
    createSteerProcessor().processInputStep(next.args);
    expect(next.added).toEqual([]);
    expect(next.rotateResponseMessageId).not.toHaveBeenCalled();
  });

  it("no steer is injected into another session's turn", () => {
    enqueueSteer("p-2", { id: "s1", text: "for session two" });
    const other = stepArgs("p-3", true);

    createSteerProcessor().processInputStep(other.args);

    expect(other.added).toEqual([]);
    expect(drainSteers("p-2")).toEqual([{ id: "s1", text: "for session two" }]);
  });

  it("ignores turns without a chat thread", () => {
    enqueueSteer("p-4", { id: "s1", text: "queued" });
    const step = stepArgs(undefined);
    createSteerProcessor().processInputStep(step.args);
    createSteerProcessor().processInputStep({
      messageList: step.args.messageList,
    });
    expect(step.added).toEqual([]);
    expect(drainSteers("p-4")).toHaveLength(1);
  });

  it("forgets delivered steers when the thread's turn ends", () => {
    beginSteerableTurn("p-6");
    enqueueSteer("p-6", { id: "p6-s1", text: "go" });
    createSteerProcessor().processInputStep(stepArgs("p-6").args);
    expect(isSteerDelivered("p6-s1")).toBe(true);
    endSteerableTurn("p-6");
    expect(isSteerDelivered("p6-s1")).toBe(false);
  });

  it("injects without rotating when the caller cannot rotate the response message", () => {
    enqueueSteer("p-5", { id: "s1", text: "go" });
    const step = stepArgs("p-5", false);
    createSteerProcessor().processInputStep(step.args);
    expect(step.added).toHaveLength(1);
    expect(step.markResponseMessageBoundary).not.toHaveBeenCalled();
  });
});
