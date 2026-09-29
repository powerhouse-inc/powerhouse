import { describe, expect, it } from "vitest";
import type { BlockResolutionView } from "./forms.js";
import {
  updateVersion,
  versionBadge,
  versionSummary,
} from "./version-badge.js";

const resolution = (
  patch: Partial<BlockResolutionView>,
): BlockResolutionView => ({
  stepId: "a",
  pieceName: "@acme/piece",
  pieceVersion: "1.0.0",
  name: "run",
  kind: "action",
  resolvedVersion: "1.0.0",
  source: "local",
  match: "exact",
  note: null,
  latestVersion: "1.0.0",
  ...patch,
});

describe("versionBadge", () => {
  it("shows nothing for an exact match or a core block run as installed", () => {
    expect(versionBadge(resolution({}))).toBeNull();
    expect(
      versionBadge(
        resolution({
          pieceName: "@powerhousedao/piece-core",
          name: "branch",
          match: "installed",
        }),
      ),
    ).toBeNull();
  });

  it("tones fallback amber, missing red, the rest neutral", () => {
    expect(
      versionBadge(resolution({ match: "fallback", resolvedVersion: "2.0.0" })),
    ).toEqual({
      tone: "warn",
      label: "v2.0.0",
      title: "Configured with v1.0.0, runs v2.0.0 from local",
    });
    expect(
      versionBadge(
        resolution({ match: "missing", resolvedVersion: null, note: "gone" }),
      ),
    ).toEqual({ tone: "fail", label: "Missing", title: "gone" });
    expect(
      versionBadge(
        resolution({ match: "compatible", resolvedVersion: "1.2.0" }),
      )?.tone,
    ).toBe("neutral");
  });

  it("treats an installed piece at the pinned version as exact", () => {
    expect(versionBadge(resolution({ match: "installed" }))).toBeNull();
    expect(
      versionBadge(resolution({ match: "installed", resolvedVersion: "1.1.0" }))
        ?.label,
    ).toBe("v1.1.0");
  });
});

describe("updateVersion", () => {
  it("offers only a newer version than the pin", () => {
    expect(updateVersion(resolution({ latestVersion: "1.3.0" }))).toBe("1.3.0");
    expect(updateVersion(resolution({ latestVersion: "0.9.0" }))).toBeNull();
    expect(updateVersion(resolution({ latestVersion: null }))).toBeNull();
    expect(updateVersion(undefined)).toBeNull();
  });
});

describe("versionSummary", () => {
  const compatible = resolution({
    stepId: "c",
    match: "compatible",
    resolvedVersion: "1.2.0",
  });
  const installed = resolution({
    stepId: "i",
    match: "installed",
    resolvedVersion: "1.1.0",
  });
  const fallback = resolution({
    stepId: "f",
    match: "fallback",
    resolvedVersion: "2.0.0",
  });
  const missing = resolution({
    stepId: "m",
    match: "missing",
    resolvedVersion: null,
  });

  it("is absent when every block runs its pinned version", () => {
    expect(versionSummary([resolution({})])).toBeNull();
    expect(versionSummary([resolution({ match: "installed" })])).toBeNull();
  });

  it("stays neutral when every mismatch is compatible or installed", () => {
    expect(versionSummary([compatible, installed])).toMatchObject({
      text: "2 steps run a different piece version",
      tone: "neutral",
      firstStepId: "c",
    });
  });

  it("turns amber once a step falls back", () => {
    expect(versionSummary([compatible, fallback])).toMatchObject({
      text: "2 steps run a different piece version",
      tone: "warn",
    });
  });

  it("turns amber and leads with a missing piece", () => {
    expect(versionSummary([compatible, missing])).toMatchObject({
      text: "1 step can't find its piece",
      tone: "warn",
      firstStepId: "m",
    });
  });
});
