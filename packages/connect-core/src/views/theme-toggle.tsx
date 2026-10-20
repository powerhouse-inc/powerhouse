import { useTheme } from "@powerhousedao/reactor-browser";

/** Flips between light and dark; the first flip pins the system theme's opposite. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className={
        className ??
        "rounded px-2 py-1 text-core-muted hover:bg-core-hover hover:text-core-fg"
      }
      onClick={() => setTheme(next)}
    >
      {theme === "dark" ? "☾" : "☀"}
    </button>
  );
}
