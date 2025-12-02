"use client";

import React from "react";
import { useUser } from "../hooks/use-user.js";
import type { User } from "../lib/renown/index.js";

export interface AuthButtonRenderProps {
  user: User;
  logout: () => Promise<void>;
  openProfile: () => void;
}

export interface AuthButtonProps {
  /**
   * Custom class name for the container
   */
  className?: string;
  /**
   * Base URL for the profile page
   * @default "https://renown-staging.vetra.io/profile"
   */
  profileBaseUrl?: string;
  /**
   * Custom render function when user is authenticated
   * Receives user data, logout function, and openProfile function
   */
  renderAuthenticated?: (props: AuthButtonRenderProps) => React.ReactNode;
  /**
   * Custom render function when user is not authenticated
   * Receives openRenown function
   */
  renderUnauthenticated?: (props: {
    openRenown: () => void;
    isLoading: boolean;
  }) => React.ReactNode;
  /**
   * Custom render function for loading state
   */
  renderLoading?: () => React.ReactNode;
  /**
   * Show username next to avatar
   * @default true
   */
  showUsername?: boolean;
  /**
   * Show logout button
   * @default false
   */
  showLogoutButton?: boolean;
  /**
   * Custom logout button text
   * @default "Logout"
   */
  logoutButtonText?: string;
}

/**
 * Smart authentication button that adapts based on auth state
 * Shows login button when not authenticated, and user info when authenticated
 *
 * @example
 * Basic usage:
 * ```tsx
 * import { AuthButton } from '@renown/sdk'
 *
 * function Header() {
 *   return <AuthButton />
 * }
 * ```
 *
 * @example
 * Custom rendering:
 * ```tsx
 * <AuthButton
 *   renderAuthenticated={({ user, logout }) => (
 *     <div>
 *       <span>{user.name}</span>
 *       <button onClick={logout}>Sign out</button>
 *     </div>
 *   )}
 *   renderUnauthenticated={({ openRenown }) => (
 *     <button onClick={openRenown}>Sign In</button>
 *   )}
 * />
 * ```
 *
 * @example
 * With logout button:
 * ```tsx
 * <AuthButton
 *   showLogoutButton
 *   logoutButtonText="Sign Out"
 *   profileBaseUrl="https://myapp.com/profile"
 * />
 * ```
 */
export function AuthButton({
  className = "",
  profileBaseUrl = "https://renown-staging.vetra.io/profile",
  renderAuthenticated,
  renderUnauthenticated,
  renderLoading,
  showUsername = true,
  showLogoutButton = false,
  logoutButtonText = "Logout",
}: AuthButtonProps) {
  const { user, loginStatus, isLoading, openRenown, logout } = useUser();

  const openProfile = () => {
    if (!user) return;
    const identifier = user.ethAddress || user.address || user.name;
    if (identifier) {
      window.open(`${profileBaseUrl}/${identifier}`, "_blank");
    }
  };

  // Loading state
  if (isLoading && loginStatus === "initial") {
    if (renderLoading) {
      return <div className={className}>{renderLoading()}</div>;
    }

    return (
      <div
        className={className}
        style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
      >
        <div
          style={{
            width: "1rem",
            height: "1rem",
            border: "2px solid #e5e7eb",
            borderTopColor: "#6366f1",
            borderRadius: "50%",
            animation: "spin 1s linear infinite",
          }}
        />
        <span style={{ fontSize: "0.875rem" }}>Loading...</span>
      </div>
    );
  }

  // Authenticated state
  if (loginStatus === "authorized" && user) {
    if (renderAuthenticated) {
      return (
        <div className={className}>
          {renderAuthenticated({ user, logout, openProfile })}
        </div>
      );
    }

    // Default authenticated rendering
    return (
      <div
        className={className}
        style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}
      >
        <div
          onClick={openProfile}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            cursor: "pointer",
          }}
        >
          {user.avatar ? (
            <img
              src={user.avatar}
              alt={user.name || "User"}
              style={{
                width: "2rem",
                height: "2rem",
                borderRadius: "50%",
                objectFit: "cover",
              }}
            />
          ) : (
            <div
              style={{
                width: "2rem",
                height: "2rem",
                borderRadius: "50%",
                backgroundColor: "#6366f1",
                color: "white",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: "bold",
                fontSize: "0.75rem",
              }}
            >
              {(user.name || user.did).substring(0, 2).toUpperCase()}
            </div>
          )}
          {showUsername && (
            <span style={{ fontSize: "0.875rem", fontWeight: "500" }}>
              {user.name || user.did.slice(0, 15) + "..."}
            </span>
          )}
        </div>

        {showLogoutButton && (
          <button
            onClick={logout}
            style={{
              padding: "0.25rem 0.75rem",
              border: "1px solid #d1d5db",
              borderRadius: "0.375rem",
              backgroundColor: "white",
              cursor: "pointer",
              fontSize: "0.75rem",
              fontWeight: "500",
            }}
          >
            {logoutButtonText}
          </button>
        )}
      </div>
    );
  }

  // Unauthenticated state
  if (renderUnauthenticated) {
    return (
      <div className={className}>
        {renderUnauthenticated({ openRenown, isLoading })}
      </div>
    );
  }

  // Default unauthenticated rendering
  return (
    <button
      onClick={openRenown}
      disabled={isLoading}
      className={className}
      style={{
        padding: "0.5rem 1rem",
        border: "1px solid #d1d5db",
        borderRadius: "0.375rem",
        backgroundColor: "white",
        cursor: isLoading ? "not-allowed" : "pointer",
        fontSize: "0.875rem",
        fontWeight: "500",
        opacity: isLoading ? 0.6 : 1,
      }}
    >
      {isLoading ? "Loading..." : "Login with Renown"}
    </button>
  );
}
