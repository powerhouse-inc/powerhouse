// setSchedule's two forms and the members a piece fails loudly on.
import { buildActionContext } from "../../../src/pieces/activepieces/context/action.js";
import {
  buildTriggerContext,
  InvalidCronExpressionError,
  InvalidScheduleIntervalError,
} from "../../../src/pieces/activepieces/context/trigger.js";
import { UnsupportedContextMemberError } from "../../../src/pieces/activepieces/context/stubs.js";

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

  it("refuses an interval below the one-minute floor or not a whole number", () => {
    const handle = buildTriggerContext({ propsValue: {} });
    for (const intervalMs of [59_999, 60_000.5, 0, -60_000]) {
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
  it("names createWaitpoint and waitForWaitpoint rather than reading undefined", () => {
    const { context } = buildActionContext({ propsValue: {} });
    for (const member of ["createWaitpoint", "waitForWaitpoint"] as const) {
      try {
        void context.run[member]("" as never);
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(UnsupportedContextMemberError);
        expect((error as UnsupportedContextMemberError).member).toBe(
          `run.${member}`,
        );
      }
    }
  });
});
