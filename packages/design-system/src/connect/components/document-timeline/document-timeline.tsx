import { TooltipProvider } from "#connect";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  HDivider,
  TimelineBar,
  type TimelineBarProps,
} from "./components/index.js";

export type TimelineBarItem = Omit<TimelineBarProps, "className"> & {
  id: string;
  type: "bar";
  revision?: number;
  startDate?: Date;
  endDate?: Date;
};

export type TimelineDividerItem = {
  id: string;
  type: "divider";
  timestampUtcMs?: string;
  title?: string;
  subtitle?: string;
  revision?: number;
  startDate?: Date;
  endDate?: Date;
};

export type TimelineItem = TimelineBarItem | TimelineDividerItem;

export interface DocumentTimelineProps {
  onItemClick?: (item: TimelineItem | null) => void;
  timeline?: Array<TimelineItem>;
}

const defaultTimeLineItem: TimelineBarItem = {
  id: "default",
  type: "bar",
  addSize: 0,
  delSize: 0,
};

export const DocumentTimeline = (props: DocumentTimelineProps) => {
  const { timeline = [], onItemClick } = props;
  const [selectedItem, setSelectedItem] = useState<null | string>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleClick = (item: TimelineItem) => {
    if (item.id === selectedItem || item.id === defaultTimeLineItem.id) {
      onItemClick?.(null);
      setSelectedItem(null);
    } else {
      onItemClick?.(item);
      setSelectedItem(item.id);
    }
  };

  const mergedTimelineItems = [...timeline, defaultTimeLineItem];
  const [unselectedItems, selectedItems] = useMemo(() => {
    const indexSelected = mergedTimelineItems.findIndex(
      (item) => item.id === selectedItem,
    );

    return indexSelected === -1
      ? [mergedTimelineItems, []]
      : [
          mergedTimelineItems.slice(0, indexSelected),
          mergedTimelineItems.slice(indexSelected),
        ];
  }, [mergedTimelineItems, selectedItem]);

  const renderTimelineItems = useCallback(
    (items: Array<TimelineBarItem | TimelineDividerItem>) => {
      return items.map((item) => {
        if (item.type === "divider") {
          const { timestampUtcMs, title, subtitle } = item;
          return (
            <HDivider
              key={item.id}
              timestampUtcMs={timestampUtcMs}
              title={title}
              subtitle={subtitle}
              onClick={() => handleClick(item)}
              isSelected={item.id === selectedItem}
            />
          );
        }

        return (
          <TimelineBar
            key={item.id}
            timestampUtcMs={item.timestampUtcMs}
            addSize={item.addSize}
            delSize={item.delSize}
            additions={item.additions}
            deletions={item.deletions}
            isSelected={item.id === selectedItem}
            onClick={() => handleClick(item)}
          />
        );
      });
    },
    [handleClick, selectedItem],
  );

  const unselectedContent = useMemo(
    () => renderTimelineItems(unselectedItems),
    [unselectedItems, renderTimelineItems],
  );

  const selectedContent = useMemo(
    () => renderTimelineItems(selectedItems),
    [selectedItems, renderTimelineItems],
  );

  // Scroll to the end by default
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollLeft =
        scrollContainerRef.current.scrollWidth;
    }
  }, []);

  return (
    <TooltipProvider delayDuration={0} skipDelayDuration={0}>
      <div className="relative h-[36px] w-full">
        <div className="absolute left-[0px] z-[20] h-[17px] w-[6px] bg-white">
          <div className="mt-[11px] h-[6px] w-[6px] rounded-tl-md bg-slate-50" />
        </div>

        <div className="absolute right-[0px] top-[11px] z-[20] h-[6px] w-[6px] bg-white">
          <div className="h-[6px] w-[6px] rounded-tr-md bg-slate-50" />
        </div>
        <div className="absolute inset-x-0 bottom-0 h-[25px] rounded-md bg-slate-50" />

        <div className="absolute inset-x-0 bottom-0 h-[36px]">
          <div
            ref={scrollContainerRef}
            className="h-full overflow-x-auto rounded-md"
          >
            <div className="ml-auto flex h-[36px] w-max items-end px-2 pb-0">
              <div className="flex">{unselectedContent}</div>
              <div className="flex rounded-sm bg-blue-200">
                {selectedContent}
              </div>
            </div>
          </div>
        </div>
        <div className="pointer-events-none absolute bottom-0 left-0 z-10 h-[25px] w-2 rounded-l-md bg-slate-50" />
        <div className="pointer-events-none absolute bottom-0 right-0 z-10 h-[25px] w-2 rounded-r-md bg-slate-50" />
      </div>
    </TooltipProvider>
  );
};
