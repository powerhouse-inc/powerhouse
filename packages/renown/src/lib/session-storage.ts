"use client";

import type { User } from "./renown/utils.js";

const SESSION_STORAGE_KEYS = {
  USER: "renown_user",
  LOGIN_STATUS: "renown_login_status",
  USER_DID: "renown_user_did",
} as const;

export interface SessionUserData {
  user: User;
  userDid: string;
  loginStatus: "authorized";
  timestamp: number;
}

/**
 * Session storage utilities for Renown authentication
 * Stores user data in sessionStorage to persist across page reloads
 * but clears when the browser session ends
 */
export class SessionStorageManager {
  /**
   * Store user authentication data in sessionStorage
   */
  static setUserData(userData: SessionUserData): void {
    if (typeof window === "undefined") return;

    try {
      sessionStorage.setItem(
        SESSION_STORAGE_KEYS.USER,
        JSON.stringify(userData.user),
      );
      sessionStorage.setItem(SESSION_STORAGE_KEYS.USER_DID, userData.userDid);
      sessionStorage.setItem(
        SESSION_STORAGE_KEYS.LOGIN_STATUS,
        userData.loginStatus,
      );
      sessionStorage.setItem("renown_timestamp", userData.timestamp.toString());
    } catch (error) {
      console.error("Failed to store user data in sessionStorage:", error);
    }
  }

  /**
   * Retrieve user authentication data from sessionStorage
   */
  static getUserData(): SessionUserData | null {
    if (typeof window === "undefined") return null;

    try {
      const userStr = sessionStorage.getItem(SESSION_STORAGE_KEYS.USER);
      const userDid = sessionStorage.getItem(SESSION_STORAGE_KEYS.USER_DID);
      const loginStatus = sessionStorage.getItem(
        SESSION_STORAGE_KEYS.LOGIN_STATUS,
      );
      const timestampStr = sessionStorage.getItem("renown_timestamp");

      if (!userStr || !userDid || !loginStatus || !timestampStr) {
        return null;
      }

      const user = JSON.parse(userStr) as User;
      const timestamp = parseInt(timestampStr, 10);

      return {
        user,
        userDid,
        loginStatus: loginStatus as "authorized",
        timestamp,
      };
    } catch (error) {
      console.error("Failed to retrieve user data from sessionStorage:", error);
      return null;
    }
  }

  /**
   * Check if user data exists in sessionStorage
   */
  static hasUserData(): boolean {
    if (typeof window === "undefined") return false;

    return !!(
      sessionStorage.getItem(SESSION_STORAGE_KEYS.USER) &&
      sessionStorage.getItem(SESSION_STORAGE_KEYS.USER_DID) &&
      sessionStorage.getItem(SESSION_STORAGE_KEYS.LOGIN_STATUS)
    );
  }

  /**
   * Clear all user authentication data from sessionStorage
   */
  static clearUserData(): void {
    if (typeof window === "undefined") return;

    try {
      sessionStorage.removeItem(SESSION_STORAGE_KEYS.USER);
      sessionStorage.removeItem(SESSION_STORAGE_KEYS.USER_DID);
      sessionStorage.removeItem(SESSION_STORAGE_KEYS.LOGIN_STATUS);
      sessionStorage.removeItem("renown_timestamp");
    } catch (error) {
      console.error("Failed to clear user data from sessionStorage:", error);
    }
  }

  /**
   * Check if stored user data is still valid (not expired)
   * You can implement expiration logic here if needed
   */
  static isUserDataValid(userData: SessionUserData): boolean {
    // For now, we consider session data valid for the entire browser session
    // You can add expiration logic here if needed
    return true;
  }

  /**
   * Get the stored user DID for easy re-authentication
   */
  static getStoredUserDid(): string | null {
    if (typeof window === "undefined") return null;

    try {
      return sessionStorage.getItem(SESSION_STORAGE_KEYS.USER_DID);
    } catch (error) {
      console.error("Failed to get stored user DID:", error);
      return null;
    }
  }
}
