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
    expect(describeSchedule({ mode: "cron", cron: "0 8 * * *" })).toBe(
      "Every day at 08:00 UTC",
    );
    expect(
      describeSchedule({
        mode: "cron",
        cron: "0 8 * * *",
        timezone: "Europe/Lisbon",
      }),
    ).toBe("Every day at 08:00 Europe/Lisbon");
  });

  it("describes intervals in their unit", () => {
    expect(
      describeSchedule({ mode: "interval", every: 15, unit: "minutes" }),
    ).toBe("Every 15 minutes");
    expect(
      describeSchedule({ mode: "interval", every: 1, unit: "hours" }),
    ).toBe("Every hour");
  });

  it("shows a cron it can't describe as it is", () => {
    expect(describeSchedule({ mode: "cron", cron: "0 8 * 1 *" })).toBe(
      "On schedule 0 8 * 1 *",
    );
  });

  it("says so when the runtime would refuse the config", () => {
    expect(describeSchedule({ cron: "0 8 * * *" })).toBe(
      "On a schedule that does not parse",
    );
    expect(describeSchedule({ mode: "interval", every: 15 })).toBe(
      "On a schedule that does not parse",
    );
  });
});

describe("describeTrigger", () => {
  it("names the core triggers", () => {
    expect(
      describeTrigger({
        pieceName: "@powerhousedao/piece-core",
        triggerName: "manual",
        config: {},
      }),
    ).toBe("Manual");
    expect(
      describeTrigger({
        pieceName: "@powerhousedao/piece-core",
        triggerName: "webhook",
        config: {},
      }),
    ).toBe("When its webhook is called");
    expect(describeTrigger(null)).toBe("Never starts: no trigger");
  });

  it("names a piece trigger with its piece", () => {
    expect(
      describeTrigger({
        pieceName: "@activepieces/piece-slack",
        triggerName: "new_message",
        config: {},
      }),
    ).toBe("New message in Slack");
  });

  it("names a reactor document trigger by what it filters on", () => {
    const reactor = (triggerName: string, config: unknown) =>
      describeTrigger({
        pieceName: "@powerhousedao/piece-reactor",
        triggerName,
        config,
      });
    expect(
      reactor("document-event", {
        documentType: "umh/production-ledger",
        actionType: "APPROVE_ORDER",
      }),
    ).toBe("When Approve order runs on a Production Ledger");
    expect(reactor("document-event", { documentType: "acme/invoice" })).toBe(
      "When an Invoice changes",
    );
    expect(reactor("document-event", { documentId: "abc" })).toBe(
      "When its document changes",
    );
    expect(
      reactor("document-created", { documentType: "powerhouse/workflow" }),
    ).toBe("When a Workflow is created");
    expect(reactor("document-deleted", {})).toBe("When a document is deleted");
  });

  it("leaves expressions out of a reactor trigger's text", () => {
    expect(
      describeTrigger({
        pieceName: "@powerhousedao/piece-reactor",
        triggerName: "document-event",
        config: { documentType: "{{variables.type}}", actionType: "" },
      }),
    ).toBe("When a document changes");
  });
});
