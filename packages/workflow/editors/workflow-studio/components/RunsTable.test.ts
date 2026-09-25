import { describe, expect, it } from "vitest";
import { triggerLabel } from "./RunsTable.js";

describe("triggerLabel", () => {
  it("names a piece run's trigger the way the workflow list does", () => {
    expect(
      triggerLabel("piece:@activepieces/piece-slack@1.0.0#trigger:new_message"),
    ).toBe("New message in Slack");
  });

  it("keeps the core kinds' labels", () => {
    expect(triggerLabel("document-event")).toBe("Document change");
    expect(triggerLabel("manual")).toBe("Manual");
  });
});
