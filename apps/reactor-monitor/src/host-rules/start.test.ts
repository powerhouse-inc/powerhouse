import { describe, expect, it } from "vitest";
import {
  CHECK_REASONS,
  checkReason,
  fixIssuesFirst,
  START_REASONS,
  startReason,
} from "./start.js";

const ready = {
  issues: 0,
  reactors: 1,
  controller: true,
  served: true,
  wired: true,
};

describe("startReason", () => {
  it("names the first thing in the way", () => {
    expect(startReason(ready)).toBeUndefined();
    expect(startReason({ ...ready, running: true })).toBe(
      START_REASONS.running,
    );
    expect(startReason({ ...ready, issues: 2 })).toBe(fixIssuesFirst(2));
    expect(startReason({ ...ready, reactors: 0 })).toBe(
      START_REASONS.noReactors,
    );
    expect(startReason({ ...ready, controller: false })).toBe(
      START_REASONS.noController,
    );
    expect(startReason({ ...ready, served: undefined })).toBe(
      START_REASONS.checking,
    );
    expect(startReason({ ...ready, served: false })).toBe(
      START_REASONS.notServed,
    );
    expect(startReason({ ...ready, wired: false })).toBe(
      START_REASONS.notWired,
    );
  });

  it("asks a blank host for a project to run in", () => {
    expect(startReason({ ...ready, blank: {} })).toBe(START_REASONS.noProject);
    expect(
      startReason({ ...ready, blank: { project: "/p" }, served: false }),
    ).toBe(START_REASONS.projectGone);
    expect(startReason({ ...ready, blank: { project: "/p" } })).toBeUndefined();
  });

  it("sends a downloaded blank host back to Blank", () => {
    expect(startReason({ ...ready, blankImport: true })).toBe(
      START_REASONS.blankImport,
    );
    expect(checkReason({ blankImport: true })).toBe(CHECK_REASONS.blankImport);
  });
});

describe("checkReason", () => {
  it("needs a project for a blank host", () => {
    expect(checkReason({})).toBeUndefined();
    expect(checkReason({ blank: {} })).toBe(CHECK_REASONS.noProject);
    expect(checkReason({ blank: { project: "/p" } })).toBeUndefined();
  });
});
