import { useTheme } from "@powerhousedao/reactor-browser";
import { Monitor, Moon, Sun } from "lucide-react";
import { twMerge } from "tailwind-merge";

type Theme = "light" | "dark" | "system";

const OPTIONS = [
  { value: "light", Icon: Sun, label: "Light" },
  { value: "dark", Icon: Moon, label: "Dark" },
  { value: "system", Icon: Monitor, label: "System" },
] as const;

export function ThemeSwitch() {
  const { theme, isSystem, setTheme } = useTheme();

  function select(val: Theme) {
    setTheme(val);
  }

  function isActive(value: Theme) {
    if (value === "system" && isSystem) return true;
    if (value === "dark" && theme === "dark") return true;
    if (value === "light" && theme === "light") return true;
    return false;
  }

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="flex w-fit flex-col items-center gap-4 rounded-xl bg-slate-50 dark:bg-slate-800"
    >
      {OPTIONS.map(({ value, Icon, label }) => (
        <div
          key={value}
          role="radio"
          aria-checked={isActive(value)}
          aria-label={label}
          tabIndex={0}
          onClick={() => select(value)}
          onKeyDown={(e) =>
            (e.key === "Enter" || e.key === " ") && select(value)
          }
          className={twMerge(
            "flex size-fit cursor-pointer content-center items-center transition-colors",
            isActive(value)
              ? "text-gray-900 dark:text-slate-50"
              : "text-gray-500 dark:text-slate-200",
          )}
        >
          <Icon size={24} strokeWidth={2} aria-hidden="true" />
        </div>
      ))}
    </div>
  );
}
