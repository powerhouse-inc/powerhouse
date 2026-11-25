import type { LucideIcon } from "lucide-react";
import { cn } from "../lib/cn.js";
import type { DataAttributes } from "../lib/data-attributes.js";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip.js";
import { tabProps } from "./tabs.js";

type SegmentedItem<T extends string> = {
  id: T;
  label: string;
  /** With an icon, the label hides in a narrow panel. */
  icon?: LucideIcon;
  /** On hover, and the button's accessible name. */
  tooltip?: string;
  data?: DataAttributes;
};

/**
 * A few choices in one pill, one of them on. As `tabs` it chooses what the
 * panel `panelId` shows (set it up with `tabPanelProps`): tab roles, and the
 * arrow keys move between choices. As `toggle` it switches a view in place:
 * pressed buttons.
 */
export function Segmented<T extends string>({
  label,
  items,
  value,
  onChange,
  mode,
  ...data
}: {
  label: string;
  items: readonly SegmentedItem<T>[];
  value: T;
  onChange: (id: T) => void;
  mode: { kind: "tabs"; panelId: string } | { kind: "toggle" };
} & DataAttributes) {
  const ids = items.map((item) => item.id);
  return (
    <div
      role={mode.kind === "tabs" ? "tablist" : "group"}
      aria-label={label}
      {...data}
      className="flex rounded-md bg-foreground/[0.06] p-0.5"
    >
      {items.map(({ id, label: text, icon: Icon, tooltip, data }) => {
        const props = {
          type: "button",
          ...(mode.kind === "tabs"
            ? tabProps(mode.panelId, ids, id, value, onChange)
            : { "aria-pressed": id === value, onClick: () => onChange(id) }),
          // A label hidden in a narrow panel names nothing: the icon needs one.
          "aria-label": tooltip ?? (Icon ? text : undefined),
          ...data,
          className: cn(
            "flex h-6 cursor-pointer items-center gap-1 rounded-[5px] px-2.5 text-[12px] text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
            id === value && "bg-background text-foreground shadow-xs",
          ),
        } as const;
        const content = (
          <>
            {Icon && <Icon aria-hidden className="size-3" />}
            <span className={cn(Icon && "hidden @[25rem]/main:inline")}>
              {text}
            </span>
          </>
        );
        if (!tooltip) {
          return (
            <button key={id} {...props}>
              {content}
            </button>
          );
        }
        return (
          <Tooltip key={id}>
            <TooltipTrigger render={<button {...props} />}>
              {content}
            </TooltipTrigger>
            <TooltipContent side="top">{tooltip}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
