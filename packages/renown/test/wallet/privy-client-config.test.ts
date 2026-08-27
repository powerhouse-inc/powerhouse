import { describe, expect, it } from "vitest";
import { buildPrivyClientConfig } from "../../src/wallet/privy/client-config.js";
import { LoginMethod } from "../../src/wallet/types.js";

const CHAIN = {
  id: 1,
  name: "Ethereum",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://eth.example"] } },
};

describe("buildPrivyClientConfig", () => {
  it("restricts Privy's modal to the configured methods", () => {
    const config = buildPrivyClientConfig({
      methods: [LoginMethod.EMAIL, LoginMethod.GOOGLE],
      mode: "light",
    });
    expect(config.loginMethods).toEqual(["email", "google"]);
  });

  // Privy's provider root fetches the WalletConnect explorer listings (~163 KB)
  // on mount for any other walletList, regardless of externalWallets.*.
  it("defaults walletList to detected wallets only", () => {
    const config = buildPrivyClientConfig({
      methods: [LoginMethod.EMAIL],
      mode: "light",
    });
    expect(config.appearance?.walletList).toEqual([
      "detected_ethereum_wallets",
    ]);
    expect(config.externalWallets?.disableAllExternalWallets).toBe(true);
    expect(config.externalWallets?.walletConnect?.enabled).toBe(false);
  });

  it("lets a host override walletList", () => {
    const config = buildPrivyClientConfig({
      methods: [LoginMethod.EMAIL],
      mode: "light",
      walletList: ["metamask", "wallet_connect"],
    });
    expect(config.appearance?.walletList).toEqual([
      "metamask",
      "wallet_connect",
    ]);
  });

  it("pins the embedded wallet to the given chain", () => {
    const config = buildPrivyClientConfig({
      methods: [LoginMethod.EMAIL],
      mode: "dark",
      chain: CHAIN,
    });
    expect(config.defaultChain?.id).toBe(1);
    expect(config.supportedChains?.map((c) => c.id)).toEqual([1]);
  });

  it("omits chain and accent when not given", () => {
    const config = buildPrivyClientConfig({
      methods: [LoginMethod.EMAIL],
      mode: "dark",
    });
    expect(config.defaultChain).toBeUndefined();
    expect(config.supportedChains).toBeUndefined();
    expect(config.appearance).toEqual({
      theme: "dark",
      walletList: ["detected_ethereum_wallets"],
    });
  });

  it("keeps embedded-wallet signing silent", () => {
    const config = buildPrivyClientConfig({
      methods: [LoginMethod.EMAIL],
      mode: "light",
      accentColor: "#0084ff",
    });
    expect(config.appearance?.accentColor).toBe("#0084ff");
    expect(config.embeddedWallets).toEqual({
      ethereum: { createOnLogin: "users-without-wallets" },
      showWalletUIs: false,
    });
  });
});
