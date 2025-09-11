import type { Eip1193Provider } from "ethers";
import type { JsonRpcSigner } from "ethers";
import { BrowserProvider } from "ethers";
import { create } from "zustand";

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

interface WalletState {
  isConnected: boolean;
  walletAddress: string | undefined;
  getProvider: () => Promise<JsonRpcSigner>;
  connectWallet: () => Promise<string>;
  signMessage: (message: string) => Promise<string>;
}

const useWallet = create<WalletState>((set, get) => ({
  isConnected: false,
  walletAddress: undefined as string | undefined,
  getProvider: () => {
    if (!window.ethereum) {
      throw new Error("Please install web-based wallet such as Metamask");
    }
    const provider = new BrowserProvider(window.ethereum);

    return provider.getSigner();
  },
  connectWallet: async function () {
    const address = await (await get().getProvider()).getAddress();
    if (!address) {
      throw new Error("Wallet is not connected");
    }

    set((state) => ({
      ...state,
      walletAddress: address,
      isConnected: true,
    }));

    return address;
  },

  signMessage: async function (message: string) {
    const walletAddress = get().walletAddress;

    if (!walletAddress) {
      throw new Error("Wallet is not connected");
    }

    const signature = await (await get().getProvider()).signMessage(message);
    return signature;
  },
}));

export default useWallet;
