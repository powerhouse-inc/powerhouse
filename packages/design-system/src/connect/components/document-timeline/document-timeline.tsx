/* eslint-disable react/jsx-no-bind */
import { TooltipProvider } from "#connect";
import { useCallback, useMemo, useState } from "react";
import {
  HDivider,
  TimelineBar,
  type TimelineBarProps,
} from "./components/index.js";

export type TimelineBarItem = Omit<TimelineBarProps, "className"> & {
  id: string;
  type: "bar";
};

export type TimelineDividerItem = {
  id: string;
  type: "divider";
};

export interface DocumentTimelineProps {
  timeline?: Array<TimelineBarItem | TimelineDividerItem>;
}

const defaultTimeLineItem: TimelineBarItem = {
  id: "default",
  type: "bar",
  addSize: 0,
  delSize: 0,
};

export const DocumentTimeline = (props: DocumentTimelineProps) => {
  const { timeline = [] } = props;
  const [selectedItem, setSelectedItem] = useState<null | string>(null);

  const handleClick = (id: string | null) => {
    if (id === selectedItem || id === defaultTimeLineItem.id) {
      setSelectedItem(null);
    } else {
      setSelectedItem(id);
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
        if (item.type === "bar") {
          return (
            <TimelineBar
              key={item.id}
              isSelected={item.id === selectedItem}
              addSize={item.addSize}
              delSize={item.delSize}
              timestamp={item.timestamp}
              additions={item.additions}
              deletions={item.deletions}
              onClick={() => handleClick(item.id)}
            />
          );
        }

        return <HDivider key={item.id} />;
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

  console.log("selectedItem", selectedItem);
  console.log("unselectedItems", unselectedItems);
  console.log("selectedItems", selectedItems);

  return (
    <TooltipProvider delayDuration={0} skipDelayDuration={0}>
      <div className="flex h-[25px] w-full overflow-x-auto rounded-md bg-slate-50">
        <div className="ml-auto flex w-max items-center px-2">
          <div className="flex">{unselectedContent}</div>
          <div className="flex rounded-sm bg-blue-200">{selectedContent}</div>
        </div>
      </div>
    </TooltipProvider>
  );
};
