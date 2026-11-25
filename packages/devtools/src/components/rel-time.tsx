import { useEffect, useState } from "react";
import { cn } from "../lib/cn.js";

function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

function formatAgo(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 5) return "now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/** How long ago `at` was, kept current; the exact time on hover. */
export function RelTime({ at, className }: { at: number; className?: string }) {
  const now = useNow();
  return (
    <time
      className={cn("tabular-nums", className)}
      dateTime={new Date(at).toISOString()}
      title={new Date(at).toLocaleString()}
    >
      {formatAgo(at, now)}
    </time>
  );
}
