import { TooltipProvider } from "#connect";
import { useMemo } from "react";
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

  const content = useMemo(() => {
    return [...timeline, defaultTimeLineItem].map((item) => {
      if (item.type === "bar") {
        return (
          <TimelineBar
            key={item.id}
            addSize={item.addSize}
            delSize={item.delSize}
            timestamp={item.timestamp}
            additions={item.additions}
            deletions={item.deletions}
          />
        );
      }

      return <HDivider key={item.id} />;
    });
  }, [timeline, defaultTimeLineItem]);

  return (
    <TooltipProvider delayDuration={0} skipDelayDuration={0}>
      <div className="flex h-[25px] items-center justify-end rounded-md bg-slate-50 px-2">
        {content}
      </div>
    </TooltipProvider>
  );
};
