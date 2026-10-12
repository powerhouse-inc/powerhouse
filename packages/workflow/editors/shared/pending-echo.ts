// Saves round-trip through the reactor and echo back late, in order. The
// values sent but not yet echoed stay shown, so each edit builds on the last.
import { useState, type FocusEvent } from "react";

// Sorted keys, so a value and its echo compare equal however each was built.
export function keyOf(value: unknown): string {
  return JSON.stringify(value, (_, entry: unknown) =>
    entry && typeof entry === "object" && !Array.isArray(entry)
      ? Object.fromEntries(
          Object.entries(entry).sort(([a], [b]) => a.localeCompare(b)),
        )
      : entry,
  );
}

export interface PendingEcho<T, N extends T> {
  // The newest value sent, else the saved one.
  value: T;
  // Sends `next` unless it equals the value shown.
  commit: (next: N) => void;
  // For a container: saves coalesced back to the saved value never echo.
  onBlur: (event: FocusEvent<HTMLElement>) => void;
}

// Shows the newest value sent until `saved` echoes it; a saved value matching
// none of those sent is an outside change, shown at once.
export function usePendingEcho<T, N extends T = T>(
  saved: T,
  onChange: (next: N, shown: T) => void,
): PendingEcho<T, N> {
  const savedKey = keyOf(saved);
  const [sent, setSent] = useState<N[]>([]);
  const [seen, setSeen] = useState(savedKey);
  let pending = sent;
  if (seen !== savedKey) {
    const echo = sent.findIndex((value) => keyOf(value) === savedKey);
    pending = echo === -1 ? [] : sent.slice(echo + 1);
    setSeen(savedKey);
    setSent(pending);
  }
  const value: T = pending.length > 0 ? pending[pending.length - 1] : saved;
  return {
    value,
    commit: (next) => {
      if (keyOf(next) === keyOf(value)) return;
      setSent([...pending, next]);
      onChange(next, value);
    },
    onBlur: (event) => {
      const inside = event.currentTarget.contains(
        event.relatedTarget as Node | null,
      );
      if (pending.length > 0 && !inside && keyOf(value) === savedKey) {
        setSent([]);
      }
    },
  };
}
