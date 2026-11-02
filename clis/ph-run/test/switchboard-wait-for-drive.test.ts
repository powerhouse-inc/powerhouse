import { describe, expect, it, vi } from "vitest";
import { waitForDrive } from "../src/runners/switchboard.js";

const answer = (status: number) =>
  Promise.resolve(new Response(null, { status }));

function sequence(...statuses: (number | "down")[]) {
  let i = 0;
  const fetchImpl = vi.fn(() => {
    const next = statuses[Math.min(i++, statuses.length - 1)];
    return next === "down"
      ? Promise.reject(new Error("ECONNREFUSED"))
      : answer(next);
  });
  return fetchImpl as unknown as typeof fetch & { mock: { calls: unknown[] } };
}

describe("waitForDrive", () => {
  it("returns when the drive answers 200, after the server comes up", async () => {
    const fetchImpl = sequence("down", "down", 200);
    await waitForDrive("http://sb/d/x", 5_000, undefined, fetchImpl);
    expect(fetchImpl.mock.calls).toHaveLength(3);
  });

  it("accepts a hidden drive (404/401/403) when the reactor says it is served", async () => {
    for (const status of [404, 401, 403]) {
      const served = vi.fn(() => Promise.resolve(true));
      await waitForDrive("http://sb/d/x", 5_000, served, sequence(status));
      expect(served).toHaveBeenCalledTimes(1);
    }
  });

  it("keeps waiting on 404 while the reactor does not know the drive, then times out", async () => {
    const served = vi.fn(() => Promise.resolve(false));
    await expect(
      waitForDrive("http://sb/d/x", 900, served, sequence(404)),
    ).rejects.toThrow(/did not answer within 900ms/);
    expect(served.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("without a served check, 404 means not yet, as before", async () => {
    await expect(
      waitForDrive("http://sb/d/x", 500, undefined, sequence(404)),
    ).rejects.toThrow(/did not answer/);
  });

  it("a served check that throws counts as not served", async () => {
    const served = vi.fn(() => Promise.reject(new Error("no read model yet")));
    await expect(
      waitForDrive("http://sb/d/x", 500, served, sequence(404)),
    ).rejects.toThrow(/did not answer/);
  });
});
