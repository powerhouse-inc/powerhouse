import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ spawn: vi.fn() }));

vi.mock("cross-spawn", () => ({ default: mocks.spawn }));

import { spawnAsync } from "./spawn-async.js";

describe("spawnAsync", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("inherits stdio without enabling a shell", async () => {
    const child = Object.assign(new EventEmitter(), {
      stdout: null,
      stderr: null,
    });
    mocks.spawn.mockReturnValue(child);
    const args = ["exec", "tailwindcss", "-o", "build output;safe/style.css"];

    const result = spawnAsync("pnpm", args, { stdio: "inherit" });
    queueMicrotask(() => child.emit("close", 0));

    await expect(result).resolves.toBe("");
    expect(mocks.spawn).toHaveBeenCalledWith("pnpm", args, {
      cwd: undefined,
      env: undefined,
      stdio: "inherit",
    });
  });
});
