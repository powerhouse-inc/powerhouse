import { afterEach, describe, expect, it, vi } from "vitest";

const getConfig = vi.hoisted(() => vi.fn());
vi.mock("../file-system/get-config.js", () => ({ getConfig }));

const { resolveConnectPortDefault, resolveSwitchboardPortDefault } =
  await import("./vetra.js");

describe("vetra port defaults", () => {
  afterEach(() => {
    delete process.env.PH_SWITCHBOARD_PORT;
    delete process.env.PH_VETRA_CONNECT_PORT;
    getConfig.mockReset();
  });

  it("prefers PH_SWITCHBOARD_PORT over the config value", () => {
    process.env.PH_SWITCHBOARD_PORT = "41999";
    getConfig.mockReturnValue({ reactor: { port: 41001 } });
    expect(resolveSwitchboardPortDefault()).toBe(41999);
  });

  it("falls back to reactor.port from the config", () => {
    getConfig.mockReturnValue({ reactor: { port: 41001 } });
    expect(resolveSwitchboardPortDefault()).toBe(41001);
  });

  it("falls back to the standard switchboard port when the config is silent", () => {
    getConfig.mockReturnValue({});
    expect(resolveSwitchboardPortDefault()).toBe(4001);
  });

  it("ignores an unparseable PH_SWITCHBOARD_PORT", () => {
    process.env.PH_SWITCHBOARD_PORT = "not-a-port";
    getConfig.mockReturnValue({ reactor: { port: 41001 } });
    expect(resolveSwitchboardPortDefault()).toBe(41001);
  });

  it("prefers PH_VETRA_CONNECT_PORT over vetra.connectPort", () => {
    process.env.PH_VETRA_CONNECT_PORT = "32999";
    getConfig.mockReturnValue({ vetra: { connectPort: 32001 } });
    expect(resolveConnectPortDefault()).toBe(32999);
  });

  it("falls back to vetra.connectPort", () => {
    getConfig.mockReturnValue({ vetra: { connectPort: 32001 } });
    expect(resolveConnectPortDefault()).toBe(32001);
  });

  it("falls back to the standard vetra connect port when the config is silent", () => {
    getConfig.mockReturnValue({});
    expect(resolveConnectPortDefault()).toBe(3001);
  });
});
