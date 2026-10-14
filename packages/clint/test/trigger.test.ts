import { describe, it, expect } from "vitest";
import { defineTrigger } from "../src/core/trigger.js";

describe("defineTrigger", () => {
  it("returns a trigger with id and type", () => {
    const trigger = defineTrigger({
      id: "test",
      type: "condition",
      poll: async () => null,
    });
    expect(trigger.id).toBe("test");
    expect(trigger.type).toBe("condition");
  });

  it("preserves setup function", () => {
    const setup = async () => {};
    const trigger = defineTrigger({
      id: "test",
      type: "condition",
      setup,
      poll: async () => null,
    });
    expect(trigger.setup).toBe(setup);
  });

  it("preserves poll function", () => {
    const poll = async () => null;
    const trigger = defineTrigger({
      id: "test",
      type: "condition",
      poll,
    });
    expect(trigger.poll).toBe(poll);
  });

  it("preserves state initializer", () => {
    const state = () => ({ pending: 0 });
    const trigger = defineTrigger<{ pending: number }>({
      id: "test",
      type: "condition",
      state,
      poll: async () => null,
    });
    expect(trigger.state).toBe(state);
  });
});
