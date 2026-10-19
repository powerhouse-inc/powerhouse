export type {
  DocumentTimelineProps,
  TimelineBarItem,
  TimelineDividerItem,
  TimelineItem,
} from "./document-timeline.impl.js";
import { lazyComponent } from "../lazy-component.js";

export const DocumentTimeline = lazyComponent(() =>
  import("./document-timeline.impl.js").then((m) => m.DocumentTimeline),
);
