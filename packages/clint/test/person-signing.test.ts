import { describe, expect, it, vi } from "vitest";

const { openSession } = vi.hoisted(() => ({ openSession: vi.fn() }));
vi.mock("@renown/sdk/identity", () => ({ openSession }));

const { withPersonSigning } =
  await import("../src/integrations/powerhouse/person-signing.js");

describe("withPersonSigning", () => {
  it("keeps a signer the Cli names", () => {
    const signer = { ready: () => true, open: vi.fn() };
    const remote = { signer };
    expect(
      withPersonSigning(remote, {
        label: "app",
        dataDir: "/data",
        switchboardBase: "http://localhost:4001",
      }),
    ).toBe(remote);
  });

  it("writes as the person's session, labelled with the Cli's name, opened at the first write", async () => {
    const actionSigner = { user: { address: "0xperson" } };
    const bearer = vi.fn(() => Promise.resolve("bearer-1"));
    openSession.mockResolvedValue({ actionSigner, bearer });
    const remote = withPersonSigning(
      {},
      {
        label: "app",
        dataDir: "/data",
        switchboardBase: "http://localhost:4001",
      },
    );

    // Nothing is opened before a write, and requests go anonymous until then.
    expect(await remote.tokenProvider?.()).toBeUndefined();
    expect(openSession).not.toHaveBeenCalled();

    const signer = remote.signer as {
      ready(): boolean;
      open(): Promise<unknown>;
    };
    expect(signer.ready()).toBe(true);
    expect(await signer.open()).toBe(actionSigner);
    expect(openSession).toHaveBeenCalledWith({
      dataDir: "/data",
      label: "app",
      place: "home",
      interactive: false,
      target: { url: "http://localhost:4001" },
    });
    expect(await remote.tokenProvider?.()).toBe("bearer-1");
    await signer.open();
    expect(openSession).toHaveBeenCalledTimes(1);
  });

  it("keeps a token the Cli names", () => {
    const tokenProvider = () => Promise.resolve("own");
    expect(
      withPersonSigning(
        { tokenProvider },
        { label: "app", dataDir: "/data", switchboardBase: "http://x" },
      ).tokenProvider,
    ).toBe(tokenProvider);
  });
});
