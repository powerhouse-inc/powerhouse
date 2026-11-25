import { CircleX, TriangleAlert, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../lib/cn.js";
import type { DataAttributes } from "../lib/data-attributes.js";
import type { Tone } from "./status.js";

const TONE: Record<
  Extract<Tone, "warn" | "error">,
  { box: string; icon: string; Icon: LucideIcon }
> = {
  warn: {
    box: "border-warning/30 bg-warning/[0.08]",
    icon: "text-warning",
    Icon: TriangleAlert,
  },
  error: {
    box: "border-destructive/25 bg-destructive/[0.06]",
    icon: "text-destructive",
    Icon: CircleX,
  },
};

/** A problem among other content: what is wrong, and what it means. */
export function Callout({
  tone,
  title,
  children,
  role,
  className,
  ...data
}: {
  tone: Extract<Tone, "warn" | "error">;
  title: ReactNode;
  children?: ReactNode;
  role?: "alert" | "status";
  className?: string;
} & DataAttributes) {
  const { box, icon, Icon } = TONE[tone];
  return (
    <div
      role={role}
      {...data}
      className={cn(
        "flex min-w-0 gap-2.5 rounded-md border px-3 py-2 text-[13px]",
        box,
        className,
      )}
    >
      <Icon aria-hidden className={cn("mt-0.5 size-3.5 shrink-0", icon)} />
      <div className="min-w-0">
        <p className="font-medium break-words">{title}</p>
        {children && (
          <div className="mt-0.5 text-[12px] break-words text-muted-foreground">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
