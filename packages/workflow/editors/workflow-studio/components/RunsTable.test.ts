import { describe, expect, it } from "vitest";
import type { RunRecord } from "../../workflow-editor/runtime-client.js";
import { cappedIterationsNote, triggerLabel } from "./RunsTable.js";

describe("triggerLabel", () => {
  it("names a piece run's trigger the way the workflow list does", () => {
    expect(triggerLabel("piece:@activepieces/piece-slack:new_message")).toBe(
      "New message in Slack",
    );
  });

  it("keeps the core kinds' labels", () => {
    expect(triggerLabel("document-event")).toBe("Document change");
    expect(triggerLabel("manual")).toBe("Manual");
  });
});

describe("cappedIterationsNote", () => {
  const run = (extra: Partial<RunRecord>) =>
    ({ steps: [], iterations: [{}, {}], ...extra }) as unknown as RunRecord;

  it("says how many iteration steps a capped run detail holds", () => {
    expect(cappedIterationsNote(run({ iterationsTotal: 1500 }))).toBe(
      "Showing 2 of 1500 loop iteration steps.",
    );
  });

  it("says nothing when the run holds every one", () => {
    expect(cappedIterationsNote(run({ iterationsTotal: null }))).toBeNull();
    expect(cappedIterationsNote(run({}))).toBeNull();
  });
});
