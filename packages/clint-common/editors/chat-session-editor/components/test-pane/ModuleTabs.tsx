import { cn } from "../../lib/utils.js";

const MODULES = ["system", "user", "agent", "tool"] as const;
export type ModuleName = (typeof MODULES)[number];

interface ModuleTabsProps {
  activeModule: ModuleName;
  onModuleChange: (module: ModuleName) => void;
}

export function ModuleTabs({ activeModule, onModuleChange }: ModuleTabsProps) {
  return (
    <div className="flex border-b border-border">
      {MODULES.map((mod) => (
        <button
          key={mod}
          type="button"
          onClick={() => onModuleChange(mod)}
          className={cn(
            "flex-1 px-3 py-2 text-xs font-medium capitalize transition-colors",
            activeModule === mod
              ? "border-b-2 border-primary text-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {mod}
        </button>
      ))}
    </div>
  );
}

export { MODULES };
