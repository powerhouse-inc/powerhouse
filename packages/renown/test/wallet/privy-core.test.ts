import { describe, expect, it, vi } from "vitest";
import {
  PrivyCore,
  type PrivyBindings,
} from "../../src/wallet/privy/adapter.js";
import { LoginMethod } from "../../src/wallet/types.js";

const WALLET = {
  address: "0x1111111111111111111111111111111111111111",
  chainId: "eip155:1",
} as Parameters<PrivyCore["syncFromEmbeddedWallet"]>[0];

function bindings(overrides: Partial<PrivyBindings> = {}): PrivyBindings {
  return {
    openLoginModal: vi.fn(),
    initOAuth: vi.fn().mockResolvedValue(undefined),
    sendCode: vi.fn().mockResolvedValue(undefined),
    loginWithCode: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
    signTypedData: vi.fn().mockResolvedValue("0xsig"),
    ...overrides,
  };
}

describe("PrivyCore email OTP", () => {
  it("rejects sendCode until the bridge binds", async () => {
    const core = new PrivyCore([LoginMethod.EMAIL]);
    await expect(core.sendCode("a@b.c")).rejects.toThrow(/not bound/);
  });

  it("rejects email calls when email is not a configured method", async () => {
    const core = new PrivyCore([LoginMethod.GOOGLE]);
    core.bind(bindings());
    await expect(core.sendCode("a@b.c")).rejects.toThrow(/does not support/);
    await expect(core.loginWithCode("123456")).rejects.toThrow(
      /does not support/,
    );
  });

  it("forwards sendCode with disableSignup", async () => {
    const core = new PrivyCore([LoginMethod.EMAIL]);
    const b = bindings();
    core.bind(b);
    await core.sendCode("a@b.c", { disableSignup: true });
    expect(b.sendCode).toHaveBeenCalledWith({
      email: "a@b.c",
      disableSignup: true,
    });
  });

  it("loginWithCode resolves with the session once the wallet arrives", async () => {
    const core = new PrivyCore([LoginMethod.EMAIL]);
    const b = bindings();
    core.bind(b);
    const pending = core.loginWithCode("123456");
    expect(b.loginWithCode).toHaveBeenCalledWith({ code: "123456" });
    // Wallet shows up through the bridge after Privy authenticates.
    core.syncFromEmbeddedWallet(WALLET);
    const session = await pending;
    expect(session.address).toBe(WALLET.address);
    expect(session.chainId).toBe(1);
    expect(session.canSignSilently).toBe(true);
    expect(core.getSession()).toBe(session);
  });

  it("loginWithCode rejects when Privy rejects the code", async () => {
    const core = new PrivyCore([LoginMethod.EMAIL]);
    core.bind(
      bindings({
        loginWithCode: vi.fn().mockRejectedValue(new Error("Invalid code")),
      }),
    );
    await expect(core.loginWithCode("000000")).rejects.toThrow("Invalid code");
    expect(core.getSession()).toBeUndefined();
  });

  it("loginWithCode rejects through the bridge's onError", async () => {
    const core = new PrivyCore([LoginMethod.EMAIL]);
    core.bind(bindings());
    const pending = core.loginWithCode("123456");
    core.handleLoginError(new Error("boom"));
    await expect(pending).rejects.toThrow("boom");
  });

  it("returns the existing session without calling Privy", async () => {
    const core = new PrivyCore([LoginMethod.EMAIL]);
    const b = bindings();
    core.bind(b);
    core.syncFromEmbeddedWallet(WALLET);
    const session = await core.loginWithCode("ignored");
    expect(session.address).toBe(WALLET.address);
    expect(b.loginWithCode).not.toHaveBeenCalled();
  });
});

describe("PrivyCore state", () => {
  it("starts unready and notifies subscribers on change only", () => {
    const core = new PrivyCore([LoginMethod.EMAIL]);
    expect(core.getState()).toEqual({
      ready: false,
      authenticated: false,
      emailStatus: "initial",
    });
    const listener = vi.fn();
    core.subscribeState(listener);
    const next = {
      ready: true,
      authenticated: false,
      emailStatus: "awaiting-code-input" as const,
    };
    core.syncState(next);
    core.syncState({ ...next });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(core.getState()).toBe(next);
  });

  it("surfaces the OTP error", () => {
    const core = new PrivyCore([LoginMethod.EMAIL]);
    const error = new Error("Too many attempts");
    core.syncState({
      ready: true,
      authenticated: false,
      emailStatus: "error",
      emailError: error,
    });
    expect(core.getState().emailError).toBe(error);
  });
});
