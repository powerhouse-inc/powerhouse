import { getDefaultWallets as rainbowGetDefaultWallets } from "@rainbow-me/rainbowkit";
import { describe, expect, it } from "vitest";
import { base, mainnet, polygon } from "wagmi/chains";
import { buildWagmiConfig } from "../../src/wallet/rainbow/config.js";
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

// All reach WalletConnect, so none can work without a project id.
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

  // Pins why the list is built by hand rather than filtered.
  it("is not just RainbowKit's defaults minus WalletConnect", () => {
    const defaults = ids(getDefaultWallets().wallets);
    expect(defaults).toContain("walletConnect");
    const dependent = defaults.filter((id) =>
      NEEDS_WALLET_CONNECT.includes(id ?? ""),
    );
    expect(dependent.length).toBeGreaterThan(1);
  });
});

describe("buildWagmiConfig chains", () => {
  // The narrow default is a bundle-size decision, so pin it.
  it("defaults to Ethereum mainnet alone", () => {
    const config = buildWagmiConfig({ walletConnectProjectId: "test" });
    expect(config.chains.map((chain) => chain.id)).toEqual([mainnet.id]);
  });

  it("uses the chains it is given, in order", () => {
    const config = buildWagmiConfig({
      walletConnectProjectId: "test",
      chains: [polygon, mainnet, base],
    });
    expect(config.chains.map((chain) => chain.id)).toEqual([
      polygon.id,
      mainnet.id,
      base.id,
    ]);
  });

  it("builds one transport per configured chain", () => {
    const config = buildWagmiConfig({
      walletConnectProjectId: "test",
      chains: [mainnet, polygon],
    });
    expect(Object.keys(config._internal.transports).map(Number)).toEqual([
      mainnet.id,
      polygon.id,
    ]);
  });
});
