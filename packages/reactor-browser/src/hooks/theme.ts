import { useEffect, useSyncExternalStore } from "react";

type Theme = "light" | "dark";
type SystemTheme = Theme;
type StoredTheme = "light" | "dark" | "system";

const STORED_THEME_KEY = "ph:theme" as const;
const UPDATE_STORED_THEME = "ph:updateStoredTheme" as const;
const STORED_THEME_UPDATED = "ph:storedThemeUpdated" as const;
const SYSTEM_THEME_UPDATED = "ph:systemThemeUpdated" as const;
const isServer = typeof window === "undefined";

type UpdateStoredThemeEvent = CustomEvent<{ storedTheme: StoredTheme }>;
type StoredThemeUpdatedEvent = CustomEvent<{ storedTheme: StoredTheme }>;
type SystemThemeUpdatedEvent = CustomEvent<{ systemTheme: SystemTheme }>;

type ThemeWindowEvents = {
  [UPDATE_STORED_THEME]: UpdateStoredThemeEvent;
  [STORED_THEME_UPDATED]: StoredThemeUpdatedEvent;
  [SYSTEM_THEME_UPDATED]: SystemThemeUpdatedEvent;
};

declare global {
  interface WindowEventMap extends ThemeWindowEvents {}
}

function setStoredTheme(storedTheme: StoredTheme) {
  if (isServer) return;
  localStorage.setItem(STORED_THEME_KEY, storedTheme);
}

function setTheme(storedTheme: StoredTheme) {
  if (isServer) return;
  const updateStoredThemeEvent = new CustomEvent(UPDATE_STORED_THEME, {
    detail: {
      storedTheme,
    },
  });
  window.dispatchEvent(updateStoredThemeEvent);
}

function handleUpdateStoredTheme(event: UpdateStoredThemeEvent) {
  if (isServer) return;
  const storedTheme = event.detail.storedTheme;
  setStoredTheme(storedTheme);
  const storedThemeUpdatedEvent = new CustomEvent(STORED_THEME_UPDATED, {
    detail: { storedTheme },
  });
  window.dispatchEvent(storedThemeUpdatedEvent);
}

function getStoredTheme() {
  if (isServer) return undefined;
  const storedTheme = localStorage.getItem(STORED_THEME_KEY) ?? undefined;
  return storedTheme as StoredTheme;
}

function getPrefersDarkMediaQuery() {
  if (isServer) return;
  const prefersDarkMediaQuery = window.matchMedia(
    "(prefers-color-scheme: dark)",
  );
  return prefersDarkMediaQuery;
}

function getPrefersDark() {
  if (isServer) return false;
  const prefersDark = getPrefersDarkMediaQuery();
  if (prefersDark?.matches) return true;
  return false;
}

function getSystemTheme(): SystemTheme {
  if (isServer) return "light";
  const prefersDark = getPrefersDark();
  if (prefersDark) return "dark";
  return "light";
}

function handleSystemThemeChange(event: MediaQueryListEvent) {
  const isDark = event.matches;
  const systemTheme = isDark ? "dark" : "light";
  const systemThemeUpdatedEvent = new CustomEvent(SYSTEM_THEME_UPDATED, {
    detail: { systemTheme },
  });
  window.dispatchEvent(systemThemeUpdatedEvent);
}

function toggleDark(isDark: boolean) {
  if (isServer) return;
  document.documentElement.classList.toggle("dark", isDark);
}

export function initTheme() {
  if (isServer) return;

  useEffect(() => {
    window.addEventListener(UPDATE_STORED_THEME, handleUpdateStoredTheme);
    const prefersDarkMediaQuery = getPrefersDarkMediaQuery();
    prefersDarkMediaQuery?.addEventListener("change", handleSystemThemeChange);
    return () => {
      window.removeEventListener(UPDATE_STORED_THEME, handleUpdateStoredTheme);
      prefersDarkMediaQuery?.removeEventListener(
        "change",
        handleSystemThemeChange,
      );
    };
  }, []);
}

function subscribeToStoredTheme(onStoreChange: () => void) {
  if (isServer) return () => {};
  // `storage` fires in every OTHER same-origin browsing context (e.g. an
  // embedding parent window), keeping embedded instances in sync live.
  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORED_THEME_KEY || event.key === null) onStoreChange();
  };
  window.addEventListener(STORED_THEME_UPDATED, onStoreChange);
  window.addEventListener("storage", handleStorage);
  return () => {
    window.removeEventListener(STORED_THEME_UPDATED, onStoreChange);
    window.removeEventListener("storage", handleStorage);
  };
}

function subscribeToSystemTheme(onStoreChange: () => void) {
  if (isServer) return () => {};
  window.addEventListener(SYSTEM_THEME_UPDATED, onStoreChange);
  return () => {
    window.removeEventListener(SYSTEM_THEME_UPDATED, onStoreChange);
  };
}

export function useTheme() {
  const storedTheme = useSyncExternalStore(
    subscribeToStoredTheme,
    () => getStoredTheme(),
    () => "system" as const,
  );
  const systemTheme = useSyncExternalStore(
    subscribeToSystemTheme,
    () => getSystemTheme(),
    () => "light" as const,
  );

  const isSystem = storedTheme === undefined || storedTheme === "system";

  const theme = isSystem ? systemTheme : storedTheme;
  const isDark = theme === "dark";

  useEffect(() => {
    toggleDark(isDark);
  }, [isDark]);

  return {
    theme,
    isSystem,
    setTheme,
  } as const;
}
