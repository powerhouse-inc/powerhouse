// Which overview rows are folded to their title line, kept per browser.
// Storage can be missing or throw (private windows), so it is best effort.
import { useCallback, useState } from "react";

const KEY = "workflow-studio:collapsed";

function read(): Set<string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((id): id is string => typeof id === "string")
        : [],
    );
  } catch {
    return new Set();
  }
}

function write(ids: Set<string>) {
  try {
    localStorage.setItem(KEY, JSON.stringify([...ids]));
  } catch {
    // Folding still works for this visit.
  }
}

export function useCollapsed() {
  const [collapsed, setCollapsed] = useState(read);
  const toggle = useCallback((id: string) => {
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (!next.delete(id)) next.add(id);
      write(next);
      return next;
    });
  }, []);
  return { isCollapsed: (id: string) => collapsed.has(id), toggle };
}
