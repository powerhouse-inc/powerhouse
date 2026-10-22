import { useDocumentOperations } from "@powerhousedao/reactor-browser";
import { useSelectedInventoryItemDocument } from "document-models/inventory-item";
import { useEffect } from "react";
import { card } from "./styles.js";

function describe(type: string, input: unknown): string {
  const i = (input ?? {}) as Record<string, unknown>;
  switch (type) {
    case "ADD_ITEM":
      return `Added ${String(i.quantity)} × ${String(i.name)}`;
    case "ADJUST_QUANTITY": {
      const delta = Number(i.delta);
      const reason = typeof i.reason === "string" ? ` (${i.reason})` : "";
      return `${delta > 0 ? "+" : ""}${delta}${reason}`;
    }
    case "MOVE_ITEM":
      return `Moved to ${String(i.location)}`;
    default:
      return type;
  }
}

export function ActivityLog() {
  const [document] = useSelectedInventoryItemDocument();
  const { operations, hasNextPage, fetchNextPage, isLoading } =
    useDocumentOperations(document.header.id, "global");

  // Pages arrive oldest first: load them all to show the latest entries.
  useEffect(() => {
    if (hasNextPage && !isLoading) fetchNextPage();
  }, [hasNextPage, isLoading, fetchNextPage]);

  const latest = [...operations].reverse().slice(0, 8);
  const lastError = operations.at(-1)?.error;

  return (
    <section className={card} aria-label="Activity">
      <h3 className="mb-3 font-semibold">Activity</h3>
      {lastError && (
        <p role="alert" className="text-destructive mb-3 text-sm">
          Last change was rejected: {lastError}
        </p>
      )}
      {latest.length === 0 ? (
        <p className="text-muted-foreground text-sm">No changes yet.</p>
      ) : (
        <ol className="flex flex-col gap-1 text-sm">
          {latest.map((op) => (
            <li
              key={op.index}
              className={op.error ? "text-destructive line-through" : ""}
            >
              #{op.index} {describe(op.action.type, op.action.input)}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
