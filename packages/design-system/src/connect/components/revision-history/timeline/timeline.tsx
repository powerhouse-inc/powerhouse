import { useVirtualizer } from "@tanstack/react-virtual";
import { type Operation } from "document-model";
import { useEffect, useMemo, useRef, useState } from "react";
import { Revision } from "../revision/index.js";
import { Skip } from "../skip/index.js";
import { makeRows } from "../utils.js";
import { Day } from "./day.js";

export type TimelineProps = {
  readonly localOperations: Operation[];
  readonly globalOperations: Operation[];
  readonly scope: string;
};

export function Timeline(props: TimelineProps) {
  const { localOperations, globalOperations, scope } = props;
  const operations = scope === "local" ? localOperations : globalOperations;
  const initialNumRowsToShow = 100;
  const allRows = useMemo(() => makeRows(operations), [operations]);
  const [scrollAmount, setScrollAmount] = useState(0);
  const [numRowsToShow, setNumRowsToShow] = useState(initialNumRowsToShow);
  const [rows, setRows] = useState(() => allRows.slice(0, numRowsToShow));

  const parentRef = useRef<HTMLDivElement>(null);

  const hasNextPage = rows.length < allRows.length;

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => allRows[i].height,
    gap: 8,
  });

  useEffect(() => {
    if (!hasNextPage) return;
    const ratio = Math.floor(scrollAmount / 46);
    const newNumRevisions = initialNumRowsToShow + ratio;
    setNumRowsToShow((prev) =>
      newNumRevisions > prev ? newNumRevisions : prev,
    );
  }, [scrollAmount, hasNextPage]);

  useEffect(() => {
    setRows(allRows.slice(0, numRowsToShow));
  }, [allRows, numRowsToShow]);

  const handleScroll = (e: WheelEvent) => {
    setScrollAmount((prev) => {
      const n = prev + e.deltaY;
      if (n < 0) {
        return 0;
      }
      return n;
    });
  };

  useEffect(() => {
    window.addEventListener("wheel", handleScroll);
    return () => {
      window.removeEventListener("wheel", handleScroll);
    };
  }, []);

  return (
    <div
      className="border-l border-slate-100"
      ref={parentRef}
      style={{
        height: `${rowVirtualizer.getTotalSize()}px`,
        width: "100%",
        position: "relative",
      }}
    >
      {rowVirtualizer.getVirtualItems().map((virtualRow) => {
        const row = rows[virtualRow.index];

        return (
          <div
            key={virtualRow.index}
            style={{
              position: "absolute",
              top: 0,
              left: 16,
              width: "100%",
              height: `${virtualRow.size}px`,
              transform: `translateY(${virtualRow.start}px)`,
            }}
          >
            {row.type === "revision" && (
              <Revision {...row} key={virtualRow.key} />
            )}
            {row.type === "skip" && <Skip key={virtualRow.key} {...row} />}
            {row.type === "day" && <Day key={virtualRow.key} {...row} />}
          </div>
        );
      })}
    </div>
  );
}
