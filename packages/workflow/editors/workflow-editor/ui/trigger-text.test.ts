import { describe, expect, it } from "vitest";
import {
  describeCron,
  describeSchedule,
  describeTrigger,
} from "./trigger-text.js";

describe("describeCron", () => {
  it.each([
    ["0 8 * * *", "Every day at 08:00"],
    ["30 17 * * *", "Every day at 17:30"],
    ["0 9 * * 1-5", "On weekdays at 09:00"],
    ["0 10 * * 0,6", "At weekends at 10:00"],
    ["15 7 * * 1", "Every Monday at 07:15"],
    ["0 7 * * 1,3,5", "On Monday, Wednesday and Friday at 07:00"],
    ["*/15 * * * *", "Every 15 minutes"],
    ["* * * * *", "Every minute"],
    ["0 * * * *", "Every hour, on the hour"],
    ["5 * * * *", "Every hour at 05 past"],
    ["0 */6 * * *", "Every 6 hours"],
    ["0 6 1 * *", "Every month on day 1 at 06:00"],
  ])("%s → %s", (cron, text) => {
    expect(describeCron(cron)).toBe(text);
  });

  it.each(["0 8 * 1 *", "0 8-10 * * *", "nonsense", "0 8 * *"])(
    "gives up on %s",
    (cron) => {
      expect(describeCron(cron)).toBeUndefined();
    },
  );
});

describe("describeSchedule", () => {
  it("adds the timezone, UTC by default", () => {
    expect(describeSchedule({ cron: "0 8 * * *" })).toBe(
      "Every day at 08:00 UTC",
    );
    expect(
      describeSchedule({ cron: "0 8 * * *", timezone: "Europe/Lisbon" }),
    ).toBe("Every day at 08:00 Europe/Lisbon");
  });

  it("describes intervals in their unit", () => {
    expect(describeSchedule({ mode: "interval", every: 15 })).toBe(
      "Every 15 minutes",
    );
    expect(
      describeSchedule({ mode: "interval", every: 1, unit: "hours" }),
    ).toBe("Every hour");
  });

  it("shows a cron it can't describe as it is", () => {
    expect(describeSchedule({ cron: "0 8 * 1 *" })).toBe(
      "On schedule 0 8 * 1 *",
    );
  });
});

describe("describeTrigger", () => {
  it("names the core triggers", () => {
    expect(describeTrigger({ blockType: "core#manual", config: {} })).toBe(
      "Manual",
    );
    expect(describeTrigger({ blockType: "core#webhook", config: {} })).toBe(
      "When its webhook is called",
    );
    expect(describeTrigger(null)).toBe("Never starts: no trigger");
  });

  it("names a piece trigger with its piece", () => {
    expect(
      describeTrigger({
        blockType: "@activepieces/piece-slack@1.0.0#trigger:new_message",
        config: {},
      }),
    ).toBe("New message in Slack");
  });
});
