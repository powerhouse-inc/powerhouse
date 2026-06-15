import { useTheme } from "@powerhousedao/reactor-browser";
import { Monitor, Moon, Sun } from "lucide-react";
import { twMerge } from "tailwind-merge";

type Theme = "light" | "dark" | "system";

const OPTIONS = [
  { value: "light", Icon: Sun, label: "Light" },
  { value: "dark", Icon: Moon, label: "Dark" },
  { value: "system", Icon: Monitor, label: "System" },
] as const;

export function ThemeSwitch({ horizontal = false }: { horizontal?: boolean }) {
  const { theme, isSystem, setTheme } = useTheme();

  function select(val: Theme) {
    setTheme(val);
  }

  function isActive(value: Theme) {
    if (value === "system" && isSystem) return true;
    if (!isSystem && value === "dark" && theme === "dark") return true;
    if (!isSystem && value === "light" && theme === "light") return true;
    return false;
  }

  if (horizontal) {
    return (
      <div
        role="radiogroup"
        aria-label="Theme"
        className="flex h-9 items-center gap-x-0.5 pl-3"
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
              "flex cursor-pointer items-center justify-center rounded-md p-1 transition-colors",
              isActive(value)
                ? "bg-gray-50 text-gray-700 dark:bg-slate-800 dark:text-slate-200"
                : "text-gray-400 hover:text-gray-600 dark:text-slate-500 dark:hover:text-slate-400",
            )}
          >
            <Icon size={16} aria-hidden="true" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="flex w-fit flex-col items-center gap-4 rounded-xl"
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
            isActive(value) ? "text-foreground" : "text-muted-foreground",
          )}
        >
          <Icon size={24} strokeWidth={2} aria-hidden="true" />
        </div>
      ))}
    </div>
  );
}
