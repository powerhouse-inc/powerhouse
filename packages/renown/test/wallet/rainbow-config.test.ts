import { getDefaultWallets as rainbowGetDefaultWallets } from "@rainbow-me/rainbowkit";
import { describe, expect, it } from "vitest";
import { walletsWithoutWalletConnect } from "../../src/wallet/rainbow/config.js";

// RainbowKit's exports map has no "types" condition, so type-aware lint sees its
// exports as error-typed; assert the shapes we read.
type Probe = (params: { projectId: string }) => { id?: string } | undefined;
const getDefaultWallets = rainbowGetDefaultWallets as () => {
  wallets: { wallets: unknown[] }[];
};

// A wallet creator returns a descriptor carrying a stable string `id`.
function ids(groups: { wallets: unknown[] }[]): (string | undefined)[] {
  return groups.flatMap((group) =>
    group.wallets.map(
      (create) => (create as Probe)({ projectId: "probe" })?.id,
    ),
  );
}

/** All reach WalletConnect, so none work without a project id: `walletConnect` directly, `rainbow` whenever its extension is absent, `metaMask` on desktop without the extension. */
const NEEDS_WALLET_CONNECT = ["walletConnect", "rainbow", "metaMask"];

describe("walletsWithoutWalletConnect", () => {
  it("offers only the wallets that never reach WalletConnect", () => {
    expect(ids(walletsWithoutWalletConnect())).toEqual(["injected", "safe"]);
  });

  it("excludes every WalletConnect-dependent wallet", () => {
    const offered = ids(walletsWithoutWalletConnect());
    for (const id of NEEDS_WALLET_CONNECT) {
      expect(offered).not.toContain(id);
    }
  });

  // Pins why the list is built by hand: RainbowKit's defaults are full of wallets
  // that fall back to WalletConnect, so subtracting one entry is not enough.
  it("is not just RainbowKit's defaults minus WalletConnect", () => {
    const defaults = ids(getDefaultWallets().wallets);
    expect(defaults).toContain("walletConnect");
    const dependent = defaults.filter((id) =>
      NEEDS_WALLET_CONNECT.includes(id ?? ""),
    );
    expect(dependent.length).toBeGreaterThan(1);
  });
});
