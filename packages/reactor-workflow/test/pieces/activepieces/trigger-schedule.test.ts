// setSchedule's two forms and the members a piece fails loudly on.
import {
  buildActionContext,
  RunCannotPauseError,
} from "../../../src/pieces/activepieces/context/action.js";
import {
  buildTriggerContext,
  InvalidCronExpressionError,
  InvalidScheduleIntervalError,
} from "../../../src/pieces/activepieces/context/trigger.js";

describe("setSchedule", () => {
  it("records a cron schedule and defaults its timezone to UTC", () => {
    const handle = buildTriggerContext({ propsValue: {} });
    handle.context.setSchedule({ cronExpression: "*/5 * * * *" });
    expect(handle.schedules).toEqual([
      { cronExpression: "*/5 * * * *", timezone: "UTC" },
    ]);
  });

  it("keeps the timezone a piece names", () => {
    const handle = buildTriggerContext({ propsValue: {} });
    handle.context.setSchedule({
      cronExpression: "0 9 * * 1",
      timezone: "Europe/Lisbon",
    });
    expect(handle.schedules).toEqual([
      { cronExpression: "0 9 * * 1", timezone: "Europe/Lisbon" },
    ]);
  });

  it("records an interval schedule", () => {
    const handle = buildTriggerContext({ propsValue: {} });
    handle.context.setSchedule({ intervalMs: 300_000 });
    expect(handle.schedules).toEqual([{ intervalMs: 300_000 }]);
  });

  it("accepts the one-second floor exactly", () => {
    const handle = buildTriggerContext({ propsValue: {} });
    handle.context.setSchedule({ intervalMs: 1_000 });
    expect(handle.schedules).toEqual([{ intervalMs: 1_000 }]);
  });

  it("refuses an interval below the floor or not a whole number", () => {
    const handle = buildTriggerContext({ propsValue: {} });
    for (const intervalMs of [999, 1_000.5, 0, -1_000]) {
      expect(() => handle.context.setSchedule({ intervalMs })).toThrowError(
        InvalidScheduleIntervalError,
      );
    }
    expect(handle.schedules).toEqual([]);
  });

  it("refuses a cron that does not parse", () => {
    const handle = buildTriggerContext({ propsValue: {} });
    expect(() =>
      handle.context.setSchedule({ cronExpression: "not a cron" }),
    ).toThrowError(InvalidCronExpressionError);
    expect(handle.schedules).toEqual([]);
  });
});

describe("run waitpoints", () => {
  it("refuses to suspend outside a workflow run", async () => {
    const { context } = buildActionContext({ propsValue: {} });
    await expect(
      context.run.createWaitpoint({ type: "WEBHOOK" }),
    ).rejects.toBeInstanceOf(RunCannotPauseError);
    expect(() => context.run.waitForWaitpoint("wp")).toThrowError(
      RunCannotPauseError,
    );
  });
});
