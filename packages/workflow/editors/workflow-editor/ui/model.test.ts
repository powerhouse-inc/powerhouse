import { describe, expect, it } from "vitest";
import { uniqueStepKey } from "./model.js";

describe("uniqueStepKey", () => {
  it("slugifies the label", () => {
    expect(uniqueStepKey([], "Send Message To A Channel")).toBe(
      "send_message_to_a_channel",
    );
    expect(uniqueStepKey([], "  Ask ChatGPT (v2)! ")).toBe("ask_chatgpt_v2");
  });

  it("suffixes _2, _3… on collision", () => {
    expect(uniqueStepKey(["summarise"], "Summarise")).toBe("summarise_2");
    expect(uniqueStepKey(["summarise", "summarise_2"], "Summarise")).toBe(
      "summarise_3",
    );
  });

  it("falls back to step for a label with nothing to slug", () => {
    expect(uniqueStepKey([], "")).toBe("step");
    expect(uniqueStepKey(["step"], "!!!")).toBe("step_2");
  });
});
