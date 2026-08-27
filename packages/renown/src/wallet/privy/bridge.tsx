import { useEffect, useRef } from "react";
import {
  getEmbeddedConnectedWallet,
  useCreateWallet,
  useLogin,
  useLoginWithEmail,
  useLoginWithOAuth,
  useLogout,
  usePrivy,
  useSignTypedData,
  useWallets,
} from "@privy-io/react-auth";
import type { PrivyCore, SignTypedDataParams } from "./adapter.js";

type Hex = `0x${string}`;

// PrivyErrorCode is declared in the types but not exported at runtime, so match
// the code by value.
const EMBEDDED_WALLET_ALREADY_EXISTS = "embedded_wallet_already_exists";

// onError is typed as the bare code, but Privy's error class carries it on
// `privyErrorCode`, so accept either rather than trusting toString().
function isAlreadyExistsError(error: unknown): boolean {
  if (error === EMBEDDED_WALLET_ALREADY_EXISTS) return true;
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { privyErrorCode?: unknown }).privyErrorCode ===
      EMBEDDED_WALLET_ALREADY_EXISTS
  );
}

interface PrivyAdapterBridgeProps {
  core: PrivyCore;
}

// Captures the React-only Privy hooks and wires them into PrivyCore so the
// class can drive Privy without owning React state. Mounted inside PrivyProvider.
export function PrivyAdapterBridge({ core }: PrivyAdapterBridgeProps) {
  const { ready, authenticated, user } = usePrivy();
  const { wallets } = useWallets();
  const { signTypedData } = useSignTypedData();
  const { logout } = useLogout();
  const { createWallet } = useCreateWallet({
    // A wallet that already exists still arrives through useWallets(), so that
    // code is not a login failure.
    onError: (error) => {
      if (!isAlreadyExistsError(error)) core.handleLoginError(error);
    },
  });
  const { login: openLoginModal } = useLogin({
    onError: (error) => core.handleLoginError(error),
  });
  // Also mounts this hook on the page Privy redirects back to, which is what
  // lets it finish the OAuth flow there.
  const { initOAuth } = useLoginWithOAuth({
    onError: (error) => core.handleLoginError(error),
  });
  // Headless email OTP for hosts drawing their own screens (see PrivyWalletController).
  const {
    sendCode,
    loginWithCode,
    state: emailState,
  } = useLoginWithEmail({
    onError: (error) => core.handleLoginError(error),
  });

  // Privy returns fresh function references each render. A ref keeps the bind
  // stable so we bind once per core instead of re-binding every render.
  const fnsRef = useRef({
    openLoginModal,
    initOAuth,
    sendCode,
    loginWithCode,
    logout,
    signTypedData,
    createWallet,
  });
  useEffect(() => {
    fnsRef.current = {
      openLoginModal,
      initOAuth,
      sendCode,
      loginWithCode,
      logout,
      signTypedData,
      createWallet,
    };
  }, [
    openLoginModal,
    initOAuth,
    sendCode,
    loginWithCode,
    logout,
    signTypedData,
    createWallet,
  ]);

  useEffect(() => {
    core.syncState({
      ready,
      authenticated,
      email: user?.email?.address,
      emailStatus: emailState.status,
      emailError:
        emailState.status === "error"
          ? (emailState.error ?? undefined)
          : undefined,
    });
  }, [core, ready, authenticated, user, emailState]);

  // One attempt per authenticated session, reset on logout.
  const creatingWalletRef = useRef(false);

  useEffect(() => {
    return core.bind({
      openLoginModal: (opts) => fnsRef.current.openLoginModal(opts),
      initOAuth: (opts) => fnsRef.current.initOAuth(opts),
      sendCode: (opts) => fnsRef.current.sendCode(opts),
      loginWithCode: (opts) => fnsRef.current.loginWithCode(opts),
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
      creatingWalletRef.current = false;
      return;
    }
    const embedded = getEmbeddedConnectedWallet(wallets);
    if (embedded) {
      core.syncFromEmbeddedWallet(embedded);
      return;
    }
    // `createOnLogin` only fires for Privy's own modal, so initOAuth logins
    // reach here with no wallet. Privy's docs prescribe creating it manually.
    if (creatingWalletRef.current) return;
    creatingWalletRef.current = true;
    // Failures are reported through useCreateWallet's onError; this only keeps
    // the rejection from surfacing as an unhandled one.
    void fnsRef.current.createWallet().catch(() => undefined);
  }, [core, ready, authenticated, wallets]);

  return null;
}
