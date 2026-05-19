import { useSyncExternalStore } from "react";
import { doNothing } from "remeda";
import type { IsUndefined } from "type-fest";
export type Theme = "light" | "dark";
type ThemeWithSystem = "light" | "dark" | "system";

const updateThemeEventName = "ph:themeUpdated";

const STORAGE_KEY = "ph:theme" as const;

const isServer = typeof window === "undefined";
const getIsServer = () => isServer;

const clientOnly =
  <Args extends readonly unknown[], Return, TFallback>(
    fn: (
      ...args: Args
    ) => Return | IsUndefined<TFallback> extends true ? undefined : TFallback,
    fallback?: TFallback,
  ) =>
  (...args: Args) =>
    getIsServer() ? (fallback as TFallback) : fn(...args);

const getStoredTheme = clientOnly(
  () => (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? undefined,
);

const setStoredTheme = clientOnly((theme: Theme) =>
  localStorage.setItem(STORAGE_KEY, theme),
);

const removeStoredTheme = clientOnly(() =>
  localStorage.removeItem(STORAGE_KEY),
);

const getWindowColorSchemeMq = clientOnly(() =>
  window.matchMedia("(prefers-color-scheme: dark)"),
);

const getThemeFromMq = clientOnly(() =>
  getWindowColorSchemeMq()?.matches ? "dark" : "light",
);

const toggleDark = clientOnly((isDark: boolean) =>
  document.documentElement.classList.toggle("dark", isDark),
);

const handleMqSchemeChange = clientOnly((e: MediaQueryListEvent) => {
  const isSystem = getStoredTheme() === undefined;
  const isDark = e.matches;
  if (!isSystem) return;
  toggleDark(isDark);
});

const getThemeSnapshot = clientOnly(
  () => getStoredTheme() ?? "system",
  "light",
);

const getServerSideThemeSnapshot = () => "light";

export const setTheme = clientOnly((themeWithSystem: ThemeWithSystem) => {
  const isSystem = themeWithSystem === "system";

  if (isSystem) removeStoredTheme();
  else setStoredTheme(themeWithSystem);

  const themeFromMq = getThemeFromMq();
  const theme = isSystem ? themeFromMq : themeWithSystem;
  const isDark = theme === "dark";

  const themeUpdatedEvent = new CustomEvent(updateThemeEventName, {
    detail: theme,
  });

  toggleDark(isDark);
  window.dispatchEvent(themeUpdatedEvent);
});

const subscribeToTheme = clientOnly((onStoreChange: () => void) => {
  window.addEventListener(updateThemeEventName, onStoreChange);
  return () => {
    window.removeEventListener(updateThemeEventName, onStoreChange);
  };
}, doNothing());

export const initTheme = () => {
  const mq = getWindowColorSchemeMq();
  const storedTheme = getStoredTheme();
  const themeFromMq = getThemeFromMq();
  const theme = storedTheme ?? themeFromMq;
  const isDark = theme === "dark";
  toggleDark(isDark);
  if (!isServer) {
    mq.addEventListener("change", handleMqSchemeChange);
  }
};

export const useTheme = () => {
  const themeWithSystem = useSyncExternalStore(
    subscribeToTheme,
    getThemeSnapshot,
    getServerSideThemeSnapshot,
  );

  const isSystem = themeWithSystem === "system";
  const theme = isSystem ? getThemeFromMq() : themeWithSystem;

  return {
    theme,
    isSystem,
    setTheme,
  } as const;
};
