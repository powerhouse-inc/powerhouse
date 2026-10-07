// A bound connection's name, read from its document while the drive's
// connection listing catches up: a skeleton while loading, else name or id.
import { useDocumentSafe } from "@powerhousedao/reactor-browser";
import { CONNECTION_TYPE } from "./connection-create.js";

export function useConnectionName(id: string | null | undefined): {
  // Undefined while loading; the id when the document has no name.
  name?: string;
  // No such document, or one that is not a connection.
  invalid: boolean;
} {
  const { status, data } = useDocumentSafe(id || null);
  if (!id || status === "pending") return { invalid: false };
  const document = data as
    | {
        header: { name?: string; documentType: string };
        state: { global: { name?: string } };
      }
    | undefined;
  if (!document) return { name: id, invalid: true };
  return {
    name: document.state.global.name || document.header.name || id,
    invalid: document.header.documentType !== CONNECTION_TYPE,
  };
}

export function ConnectionName(props: { name?: string }) {
  if (props.name === undefined)
    return (
      <span
        aria-label="Loading connection"
        className="inline-block h-3.5 w-28 animate-pulse rounded bg-foreground/10 align-middle"
      />
    );
  return <>{props.name}</>;
}
