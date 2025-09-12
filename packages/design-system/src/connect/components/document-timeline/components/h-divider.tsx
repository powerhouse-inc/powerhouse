import { ConnectTooltip, Icon } from "@powerhousedao/design-system";
import { formatDistanceToNow } from "date-fns";
import { useEffect, useState } from "react";
import { twMerge } from "tailwind-merge";

export interface HDividerProps {
  className?: string;
  timestampUtcMs?: string;
  title?: string;
  subtitle?: string;
  onClick?: () => void;
  isSelected?: boolean;
}

export const HDivider = (props: HDividerProps) => {
  const {
    className,
    timestampUtcMs: timestamp,
    title,
    subtitle,
    onClick,
    isSelected = false,
  } = props;
  const [open, setOpen] = useState<boolean>(false);
  const hasContent = !!title || !!subtitle || !!timestamp;

  // Force update tooltips when props change
  useEffect(() => {
    // Force close and re-open if already open to refresh content
    if (open) {
      setOpen(false);
      setTimeout(() => hasContent && setOpen(true), 50);
    }
  }, [title, subtitle, timestamp, hasContent]);

  const formatTimestamp = (isoString?: string) => {
    if (!isoString) return "";
    try {
      return formatDistanceToNow(new Date(isoString), { addSuffix: true });
    } catch {
      return isoString;
    }
  };

  const tooltipContent = (
    <div className="flex flex-col text-xs">
      {!!title && <div>{title}</div>}
      {!!subtitle && <div className="text-gray-300">{subtitle}</div>}
      {!!timestamp && <div>{formatTimestamp(timestamp)}</div>}
    </div>
  );

  const handleMouseEnter = () => {
    if (hasContent) {
      setOpen(true);
    }
  };

  const handleMouseLeave = () => {
    setOpen(false);
  };

  return (
    <div
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {isSelected && (
        <Icon
          name="TimelineCaret"
          color="#4EA9FF"
          size={10}
          className="absolute top-[-11px] z-40"
        />
      )}
      <ConnectTooltip
        className="rounded-md bg-gray-900 text-white"
        content={tooltipContent}
        open={open && hasContent}
        onOpenChange={setOpen}
        delayDuration={0}
        side="bottom"
        sideOffset={5}
      >
        <div
          className={twMerge(
            "mx-0.5 flex h-[25px] w-1.5 cursor-pointer flex-col items-center justify-center rounded-[2px] hover:bg-blue-300",
            isSelected && "bg-blue-300",
            className,
          )}
          onClick={onClick}
          data-title={title}
          data-subtitle={subtitle}
          data-timestamp={timestamp}
        >
          <div className="h-0.5 w-1 rounded-full bg-gray-500" />
        </div>
      </ConnectTooltip>
    </div>
  );
};
