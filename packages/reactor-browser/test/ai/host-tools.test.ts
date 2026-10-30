import { afterEach, describe, expect, it, vi } from "vitest";
import { getHostAiTools } from "../../src/ai/host-tools.js";
import { getPHStore } from "../../src/hooks/ph-store.js";

vi.mock("../../src/hooks/ph-store.js", () => ({ getPHStore: vi.fn() }));

describe("getHostAiTools", () => {
  afterEach(() => {
    vi.mocked(getPHStore).mockReset();
  });

  it("asks the host for its tools", async () => {
    const tools = [{ name: "getDrives" }];
    vi.mocked(getPHStore).mockReturnValue({
      aiTools: () => Promise.resolve(tools),
    } as never);
    await expect(getHostAiTools()).resolves.toBe(tools);
  });

  it("says so when the host offers none", async () => {
    vi.mocked(getPHStore).mockReturnValue({} as never);
    await expect(getHostAiTools()).rejects.toThrow(
      "This app offers no tools to the assistant.",
    );
  });
});
