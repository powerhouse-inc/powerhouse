// Shim for @/components/providers/theme-provider: light theme only.
export function useTheme(): {
  theme: "light" | "dark";
  setTheme: (theme: string) => void;
} {
  return { theme: "light", setTheme: () => {} };
}
