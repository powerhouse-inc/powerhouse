"use client";

import { createContext, useCallback, useEffect, useState } from "react";
import type { IConnectCrypto } from "../crypto/index.js";
import { BrowserKeyStorage, ConnectCrypto } from "../crypto/index.js";
import { initRenown } from "../init.browser.js";
import type { LoginStatus, User } from "../lib/renown/index.js";
import {
  fetchProfileDataForUser,
  handleRenownReturn,
  openRenown as openRenownPortal,
  login as renownLogin,
  logout as renownLogout,
} from "../lib/renown/index.js";
import { SessionStorageManager } from "../lib/session-storage.js";

// User Context
export interface UserContextValue {
  /** Current authenticated user, null if not authenticated */
  user: User | null;
  /** Current login status */
  loginStatus: LoginStatus;
  /** Whether auth operations are in progress */
  isLoading: boolean;
  /** Whether the user system has been initialized */
  isInitialized: boolean;
  /** Login with optional DID (defaults to connectCrypto DID) */
  login: (userDid?: string) => Promise<void>;
  /** Logout the current user */
  logout: () => Promise<void>;
  /** Open Renown portal for authentication */
  openRenown: () => void;
}

export const UserContext = createContext<UserContextValue | null>(null);

interface UserProviderProps {
  children: React.ReactNode;
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
 * UserProvider - Central user provider for Renown
 *
 * Automatically initializes the Renown SDK and provides user state.
 * Handles initialization, login, logout, and session management.
 *
 * Usage:
 * ```tsx
 * // Wrap your app
 * <UserProvider renownUrl="https://www.renown.id">
 *   <YourApp />
 * </UserProvider>
 *
 * // In any component
 * const { user, login, logout } = useUser()
 * ```
 */
export function UserProvider({
  children,
  renownUrl = "https://www.renown.id",
  networkId = "eip155",
  chainId = "1",
  loadingComponent,
  errorComponent,
}: UserProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loginStatus, setLoginStatus] = useState<LoginStatus>("initial");
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [initError, setInitError] = useState<Error | null>(null);

  // Initialize auth system
  useEffect(() => {
    const init = async () => {
      try {
        if (typeof window === "undefined") {
          setIsInitialized(true);
          return;
        }

        // Initialize SDK if not already initialized
        if (!window.renown || !window.connectCrypto) {
          // Initialize ConnectCrypto with browser key storage
          const connectCrypto = new ConnectCrypto(new BrowserKeyStorage());

          // Initialize Renown SDK
          const renown = initRenown(
            await connectCrypto.did(),
            networkId,
            renownUrl,
          );

          // Attach to window for global access
          window.renown = renown;
          window.connectCrypto = connectCrypto;
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

        // Check if user is already logged in
        let currentUser =
          window.renown.user instanceof Function
            ? window.renown.user()
            : window.renown.user;
        currentUser =
          currentUser instanceof Promise ? await currentUser : currentUser;

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

    init();
  }, [renownUrl, networkId, chainId]);

  // Login handler
  const login = useCallback(async (userDid?: string) => {
    if (typeof window === "undefined") return;

    const renown = window.renown;
    const connectCrypto = window.connectCrypto as IConnectCrypto | undefined;

    if (!renown || !connectCrypto) {
      console.error("Renown or ConnectCrypto not available");
      setLoginStatus("not-authorized");
      return;
    }

    try {
      setIsLoading(true);
      setLoginStatus("checking");
      const did = userDid || (await connectCrypto.did());

      // Perform login
      const loggedInUser = await renownLogin(did, renown, connectCrypto);
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

  // Open Renown portal
  const openRenown = useCallback(() => {
    openRenownPortal();
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
    openRenown,
  };

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}
