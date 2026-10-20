import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearDriveAuthRefusal,
  driveUrlKey,
  isDriveAuthRefused,
  recordDriveAuthRefusal,
  subscribeDriveAuthRefusals,
} from "../src/actions/drive-auth-refusals.js";

/**
 * A drive whose discovery the switchboard refused as an auth error is never
 * listed, so its route ends in "drive not found". The registry lets the view
 * tell that refusal from a drive that really is missing.
 */
describe("drive auth refusals", () => {
  const url = "https://studio.test/switchboard/d/drive-1";
  afterEach(() => clearDriveAuthRefusal(url));

  it("keys a drive URL by its /d/<idOrSlug> segment", () => {
    expect(driveUrlKey(url)).toBe("drive-1");
    expect(driveUrlKey("https://studio.test/switchboard/d/drive-1/")).toBe(
      "drive-1",
    );
    expect(driveUrlKey("https://studio.test/graphql")).toBeUndefined();
    expect(driveUrlKey("not a url")).toBeUndefined();
  });

  it("records and clears a refusal, notifying subscribers each time", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeDriveAuthRefusals(listener);

    recordDriveAuthRefusal(url);
    recordDriveAuthRefusal(url); // idempotent: no second notification
    expect(isDriveAuthRefused("drive-1")).toBe(true);
    clearDriveAuthRefusal(url);
    expect(isDriveAuthRefused("drive-1")).toBe(false);

    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });
});
