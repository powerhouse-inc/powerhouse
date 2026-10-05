import type { Operation } from "@powerhousedao/shared/document-model";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useMemo, useRef } from "react";
import { Revision } from "../revision/revision.js";
import { Skip } from "../skip/skip.js";
import { makeRows } from "../utils.js";
import { Day } from "./day.js";

/** How far each row is indented from the timeline's vertical line. */
const ROW_INSET = 16;

/**
 * How far the day header is pulled back out again, so its ring sits centred
 * on the line rather than beside it: the `-ml-6` in `Day`.
 */
const DAY_MARKER_PULL = 24;

/**
 * How far the line is inset from the scroll container's clip edge -- exactly
 * the amount the day marker hangs past it (24 pulled back from a 16 inset
 * leaves 8 on the wrong side of zero). Without this the ring is sliced in
 * half, since a scrolling box clips on both axes.
 */
const DAY_MARKER_OVERHANG = DAY_MARKER_PULL - ROW_INSET;

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
      data-testid="revision-timeline"
      ref={parentRef}
      style={{
        maxHeight,
        overflowY: "auto",
        width: "100%",
        position: "relative",
      }}
    >
      {/*
       * The vertical line lives here rather than on the scroll container, and
       * is inset by the day marker's overhang. A scroll container clips at its
       * padding box on both axes -- setting overflow-y to auto forces
       * overflow-x from visible to auto -- so anything hanging off the line's
       * left would be cut, which is exactly what the day marker does.
       */}
      <div
        className="border-l border-border dark:border-none"
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          marginLeft: DAY_MARKER_OVERHANG,
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
                left: ROW_INSET,
                // `right`, not `width: 100%`: a full-width row offset by
                // ROW_INSET runs that far past the line's right edge, which
                // the same clipping turns into a horizontal scrollbar.
                right: 0,
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
