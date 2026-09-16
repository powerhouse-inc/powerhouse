import type { Operation } from "@powerhousedao/shared/document-model";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useMemo, useRef } from "react";
import { Revision } from "../revision/revision.js";
import { Skip } from "../skip/skip.js";
import { makeRows } from "../utils.js";
import { Day } from "./day.js";

export type TimelineProps = {
  readonly operations: readonly Operation[];
  /**
   * Height cap for the scroll area. The virtualizer needs a viewport it can
   * scroll within; any CSS length works, and the default keeps the panel's
   * header and pagination reachable without scrolling past the timeline.
   */
  readonly maxHeight?: number | string;
};

/**
 * The revision timeline, windowed by row.
 *
 * The scroll element and the content are deliberately two different
 * elements. A virtualizer decides what is visible by comparing its scroll
 * element's viewport against the total content size, so a scroll element
 * sized to the content is a viewport that shows everything at once: it never
 * scrolls, every row is "visible", and the whole page renders while still
 * paying the virtualizer's bookkeeping. The outer element here is therefore
 * bounded and scrollable, and the inner sizer carries the full height that
 * the absolutely positioned rows are placed within.
 */
export function Timeline(props: TimelineProps) {
  const { operations, maxHeight = "70vh" } = props;
  const rows = useMemo(() => makeRows([...operations]), [operations]);

  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    // Optional chaining, not rows[i].height: a shrinking list re-renders
    // before the virtualizer has re-measured, so this can be asked about an
    // index the new array no longer has.
    estimateSize: (i) => rows[i]?.height ?? 0,
    gap: 8,
    // A few rows either side so scrolling reveals rendered content rather
    // than blank space.
    overscan: 8,
  });

  return (
    <div
      className="border-l border-border dark:border-none"
      data-testid="revision-timeline"
      ref={parentRef}
      style={{
        maxHeight,
        overflowY: "auto",
        width: "100%",
        position: "relative",
      }}
    >
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const row = rows[virtualRow.index];
          if (!row) return null;

          return (
            <div
              key={virtualRow.key}
              style={{
                position: "absolute",
                top: 0,
                left: 16,
                width: "100%",
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {row.type === "revision" && <Revision {...row} />}
              {row.type === "skip" && <Skip {...row} />}
              {row.type === "day" && <Day {...row} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
