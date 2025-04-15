/* eslint-disable react/jsx-max-depth */
/* eslint-disable react/jsx-no-bind */
import { Tooltip } from "#connect";
import { format, parseISO } from "date-fns";
import { useState } from "react";
import { twMerge } from "tailwind-merge";

export interface TimelineBarProps {
  readonly className?: string;
  addSize?: 0 | 1 | 2 | 3 | 4;
  delSize?: 0 | 1 | 2 | 3 | 4;
  timestamp?: string;
  additions?: number;
  deletions?: number;
}

const getBarHeight = (size = 0) => {
  switch (true) {
    case size <= 0:
      return "h-[1px]";
    case size === 1:
      return "h-[3px]";
    case size === 2:
      return "h-[6px]";
    case size === 3:
      return "h-[9px]";
    case size >= 4:
      return "h-[12px]";
    default:
      return "h-[1px]";
  }
};

const formatTimestamp = (isoString?: string) => {
  if (!isoString) return "";
  try {
    const date = parseISO(isoString);
    return format(date, "HH:mm, dd, MMMM");
  } catch {
    return isoString;
  }
};

export const TimelineBar: React.FC<TimelineBarProps> = ({
  className,
  addSize = 0,
  delSize = 0,
  timestamp,
  additions,
  deletions,
}) => {
  const [open, setOpen] = useState<boolean>(false);
  const noChanges = addSize === 0 && delSize === 0;

  const addBarHeight = getBarHeight(addSize);
  const delBarHeight = getBarHeight(delSize);

  const tooltipContent = (
    <div className="flex flex-col text-xs">
      <div>{formatTimestamp(timestamp)}</div>
      <div className="text-green-900">{`${additions} additions +`}</div>
      <div className="text-red-700">{`${deletions} deletions -`}</div>
    </div>
  );

  const handleMouseEnter = () => {
    if (!noChanges) {
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
      {noChanges ? (
        <div
          className={twMerge(
            "flex h-[25px] w-1.5 cursor-pointer flex-col items-center justify-center rounded-[2px] hover:bg-blue-200",
            className,
          )}
          data-timestamp={timestamp}
        >
          <div className="size-[3px] rounded-full bg-gray-500" />
        </div>
      ) : (
        <Tooltip
          className="rounded-md bg-gray-900 text-white"
          content={tooltipContent}
          open={open}
          onOpenChange={setOpen}
          delayDuration={0}
        >
          <div
            className={twMerge(
              "flex h-[25px] w-1.5 cursor-pointer flex-col items-center justify-center rounded-[2px] hover:bg-blue-200",
              className,
            )}
            data-timestamp={timestamp}
          >
            <div className="flex h-3 w-0.5 items-end">
              <div
                className={twMerge(
                  "h-3 w-0.5 rounded-t-full bg-green-600",
                  addBarHeight,
                )}
              ></div>
            </div>
            <div className="flex h-3 w-0.5 items-start">
              <div
                className={twMerge(
                  "h-3 w-0.5 rounded-b-full bg-red-600",
                  delBarHeight,
                )}
              ></div>
            </div>
          </div>
        </Tooltip>
      )}
    </div>
  );
};
