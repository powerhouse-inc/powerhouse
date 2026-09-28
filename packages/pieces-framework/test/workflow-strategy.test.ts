import { describe, expect, it } from "vitest";
import {
  APP_WEBHOOK_UNSUPPORTED,
  checkTriggerStrategy,
  triggerDelivery,
  TriggerStrategyError,
} from "../src/workflow.js";

describe("triggerDelivery", () => {
  it("maps the served strategies", () => {
    expect(triggerDelivery("POLLING")).toBe("poll");
    expect(triggerDelivery("WEBHOOK")).toBe("webhook");
    expect(triggerDelivery("MANUAL")).toBe("manual");
  });

  it("refuses APP_WEBHOOK instead of polling it", () => {
    expect(() => triggerDelivery("APP_WEBHOOK")).toThrow(
      APP_WEBHOOK_UNSUPPORTED,
    );
  });

  it.each([undefined, null, "", "polling", "SOMETHING_NEW", 3])(
    "throws for %j rather than guessing",
    (strategy) => {
      expect(() => triggerDelivery(strategy)).toThrow(TriggerStrategyError);
      expect(checkTriggerStrategy(strategy)).toHaveProperty("issue");
    },
  );
});
