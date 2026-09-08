// @vitest-environment happy-dom
import type { Action } from "@powerhousedao/shared/document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setDriveMetadata } from "../src/actions/drive.js";
import type { PHGlobal } from "../src/types/global.js";

describe("setDriveMetadata (issue #2659)", () => {
  const execute = vi.fn(
    (_driveId: string, _branch: string, _actions: Action[]) =>
      Promise.resolve(undefined),
  );

  beforeEach(() => {
    execute.mockClear();
    window.ph = { reactorClient: { execute } } as unknown as PHGlobal;
  });

  afterEach(() => {
    window.ph = {};
  });

  it("forwards icon: null as a clear-the-icon request", async () => {
    await setDriveMetadata("drive-1", { icon: null });

    expect(execute).toHaveBeenCalledTimes(1);
    const [driveId, branch, actions] = execute.mock.calls[0]!;
    expect(driveId).toBe("drive-1");
    expect(branch).toBe("main");
    expect(actions).toHaveLength(1);
    const action = actions[0] as Action;
    expect(action.type).toBe("SET_DRIVE_ICON");
    expect(action.input).toEqual({ icon: null });
  });

  it("forwards a name and a set icon together, in order", async () => {
    await setDriveMetadata("drive-1", {
      name: "Renamed",
      icon: "https://example.test/icon.png",
    });

    const actions = execute.mock.calls[0]![2];
    expect(actions.map((a) => a.type)).toEqual([
      "SET_DRIVE_NAME",
      "SET_DRIVE_ICON",
    ]);
    expect(actions[0].input).toEqual({ name: "Renamed" });
    expect(actions[1].input).toEqual({
      icon: "https://example.test/icon.png",
    });
  });

  it("does not forward a null or empty name (non-nullable field)", async () => {
    expect(await setDriveMetadata("drive-1", { name: null })).toBeUndefined();
    expect(await setDriveMetadata("drive-1", { name: "" })).toBeUndefined();
    expect(execute).not.toHaveBeenCalled();
  });

  it("does nothing when neither field is provided", async () => {
    expect(await setDriveMetadata("drive-1", {})).toBeUndefined();
    expect(execute).not.toHaveBeenCalled();
  });
});
