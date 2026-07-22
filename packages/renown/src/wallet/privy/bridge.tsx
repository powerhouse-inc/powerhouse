import { useEffect, useRef } from "react";
import {
  getEmbeddedConnectedWallet,
  useLogin,
  useLogout,
  usePrivy,
  useSignTypedData,
  useWallets,
} from "@privy-io/react-auth";
import type { PrivyCore, SignTypedDataParams } from "./adapter.js";

type Hex = `0x${string}`;

interface PrivyAdapterBridgeProps {
  core: PrivyCore;
}

// Captures the React-only Privy hooks and wires them into PrivyCore so the
// class can drive Privy without owning React state. Mounted inside PrivyProvider.
export function PrivyAdapterBridge({ core }: PrivyAdapterBridgeProps) {
  const { ready, authenticated } = usePrivy();
  const { wallets } = useWallets();
  const { signTypedData } = useSignTypedData();
  const { logout } = useLogout();
  const { login: openLoginModal } = useLogin({
    onError: (error) => core.handleLoginError(error),
  });

  // Privy returns fresh function references each render. A ref keeps the bind
  // stable so we bind once per core instead of re-binding every render.
  const fnsRef = useRef({ openLoginModal, logout, signTypedData });
  useEffect(() => {
    fnsRef.current = { openLoginModal, logout, signTypedData };
  }, [openLoginModal, logout, signTypedData]);

  useEffect(() => {
    return core.bind({
      openLoginModal: (opts) => fnsRef.current.openLoginModal(opts),
      logout: () => fnsRef.current.logout(),
      // Privy owns the embedded wallet keys, so showWalletUIs:false signs the
      // credential typed-data silently as part of login.
      signTypedData: async (args, address) => {
        const result = await fnsRef.current.signTypedData(
          args as unknown as SignTypedDataParams,
          { address, uiOptions: { showWalletUIs: false } },
        );
        return result.signature as Hex;
      },
    });
  }, [core]);

  useEffect(() => {
    if (!ready) return;
    if (!authenticated) {
      core.clearSession();
      return;
    }
    const embedded = getEmbeddedConnectedWallet(wallets);
    if (embedded) core.syncFromEmbeddedWallet(embedded);
  }, [core, ready, authenticated, wallets]);

  return null;
}
