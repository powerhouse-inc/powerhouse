"use client";

import { createContext, useCallback, useEffect, useState } from "react";
import type { IRenownCrypto } from "../crypto/index.js";
import { BrowserKeyStorage, RenownCryptoBuilder } from "../crypto/index.js";
import { RenownBuilder } from "../init.browser.js";
import type { LoginStatus, User } from "../lib/renown/index.js";
import {
  fetchProfileDataForUser,
  handleRenownReturn,
  openRenown as openRenownPortal,
  login as renownLogin,
  logout as renownLogout,
} from "../lib/renown/index.js";
import { SessionStorageManager } from "../lib/session-storage.js";
import type { IRenown } from "../types.js";

// Renown User Context
export interface RenownUserContextValue {
  /** Current authenticated user, null if not authenticated */
  user: User | null;
  /** Current login status */
  loginStatus: LoginStatus;
  /** Whether auth operations are in progress */
  isLoading: boolean;
  /** Whether the user system has been initialized */
  isInitialized: boolean;
  /** Login with optional DID (defaults to renownCrypto DID) */
  login: (userDid?: string) => Promise<void>;
  /** Logout the current user */
  logout: () => Promise<void>;
  /** Open Renown portal for authentication */
  openRenown: () => void;
  /** RenownCrypto instance for cryptographic operations */
  renownCrypto: IRenownCrypto | null;
  /** Renown SDK instance */
  renown: IRenown | null;
}

export const RenownUserContext = createContext<RenownUserContextValue | null>(
  null,
);

interface RenownUserProviderProps {
  children: React.ReactNode;
  /**
   * Name of the application. Will be part of the credential.
   */
  appName?: string;
  /**
   * Renown service URL
   * @default 'https://www.renown.id'
   */
  renownUrl?: string;
  /**
   * Network ID (e.g., 'eip155')
   * @default 'eip155'
   */
  networkId?: string;
  /**
   * Chain ID (e.g., '1' for Ethereum mainnet)
   * @default '1'
   */
  chainId?: string;
  /**
   * Custom loading component shown during initialization
   * If not provided, renders children immediately (no loading screen)
   */
  loadingComponent?: React.ReactNode;
  /**
   * Custom error component shown if initialization fails
   * Receives the error and a retry function
   */
  errorComponent?: (error: Error, retry: () => void) => React.ReactNode;
}

/**
 * RenownUserProvider - Central user provider for Renown
 *
 * Automatically initializes the Renown SDK and provides user state.
 * Handles initialization, login, logout, and session management.
 *
 * Usage:
 * ```tsx
 * // Wrap your app
 * <RenownUserProvider renownUrl="https://www.renown.id">
 *   <YourApp />
 * </RenownUserProvider>
 *
 * // In any component
 * const { user, login, logout } = useUser()
 * ```
 */
export function RenownUserProvider({
  children,
  appName = "",
  renownUrl = "https://www.renown.id",
  networkId = "eip155",
  chainId = "1",
  loadingComponent,
  errorComponent,
}: RenownUserProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loginStatus, setLoginStatus] = useState<LoginStatus>("initial");
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [initError, setInitError] = useState<Error | null>(null);
  const [renownCrypto, setRenownCrypto] = useState<IRenownCrypto | null>(null);
  const [renown, setRenown] = useState<IRenown | null>(null);

  // Initialize auth system
  useEffect(() => {
    const init = async () => {
      try {
        if (typeof window === "undefined") {
          setIsInitialized(true);
          return;
        }

        // Initialize SDK if not already initialized
        if (!window.renown || !window.renownCrypto) {
          // Initialize RenownCrypto with browser key storage
          const keyStorage = await BrowserKeyStorage.create();
          const cryptoInstance = await new RenownCryptoBuilder()
            .withKeyPairStorage(keyStorage)
            .build();
          const renownInstance = await new RenownBuilder(appName)
            .withCrypto(cryptoInstance)
            .build();

          // Attach to window for global access
          window.renown = renownInstance;
          window.renownCrypto = cryptoInstance;

          // Save to state
          setRenownCrypto(cryptoInstance);
          setRenown(renownInstance);
        } else {
          // Use existing instances from window
          setRenown(window.renown);
          setRenownCrypto(window.renownCrypto);
        }

        // Check for stored session first
        const storedUserData = SessionStorageManager.getUserData();
        if (
          storedUserData &&
          SessionStorageManager.isUserDataValid(storedUserData)
        ) {
          // Restore user from stored session
          const userWithProfile = await fetchProfileDataForUser(
            storedUserData.user,
          );
          setUser(userWithProfile);
          setLoginStatus("authorized");
          setIsInitialized(true);
          return;
        }

        // Handle return from Renown authentication
        await handleRenownReturn();

        const currentUser = window.renown.user;

        if (currentUser) {
          // Fetch profile data for the logged-in user
          const userWithProfile = await fetchProfileDataForUser(currentUser);
          setUser(userWithProfile);
          setLoginStatus("authorized");
        } else {
          setLoginStatus("not-authorized");
        }

        setIsInitialized(true);
      } catch (error) {
        console.error("Failed to initialize authentication:", error);
        setInitError(error as Error);
        setLoginStatus("not-authorized");
        // Still set as initialized to prevent infinite loading
        setIsInitialized(true);
      }
    };

    init().catch(console.error);
  }, [renownUrl, networkId, chainId]);

  // Login handler
  const login = useCallback(async (userDid?: string) => {
    if (typeof window === "undefined") return;

    const renown = window.renown;
    const renownCrypto = window.renownCrypto;

    if (!renown || !renownCrypto) {
      console.error("Renown or RenownCrypto not available");
      setLoginStatus("not-authorized");
      return;
    }

    try {
      setIsLoading(true);
      setLoginStatus("checking");

      const did = userDid ?? renownCrypto.did;

      // Perform login
      const loggedInUser = await renownLogin(did, renown, renownCrypto);
      if (loggedInUser) {
        // Fetch profile data and update state
        const userWithProfile = await fetchProfileDataForUser(loggedInUser);
        setUser(userWithProfile);
        setLoginStatus("authorized");
      } else {
        setLoginStatus("not-authorized");
      }
    } catch (error) {
      console.error("Login failed:", error);
      setLoginStatus("not-authorized");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Logout handler
  const logout = useCallback(async () => {
    try {
      await renownLogout();
      setUser(null);
      setLoginStatus("not-authorized");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  }, []);

  // Show loading state while initializing
  if (!isInitialized && loadingComponent) {
    return <>{loadingComponent}</>;
  }

  // Show error state if initialization failed
  if (initError && errorComponent) {
    return <>{errorComponent(initError, () => window.location.reload())}</>;
  }

  const value = {
    user,
    loginStatus,
    isLoading,
    isInitialized,
    login,
    logout,
    openRenown: openRenownPortal,
    renownCrypto,
    renown,
  };

  return (
    <RenownUserContext.Provider value={value}>
      {children}
    </RenownUserContext.Provider>
  );
}
