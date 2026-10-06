// The documents a run's data references: the run journal keeps a reference
// (id, type, branch, revision) in place of a document's state.
import type { DocumentReference } from "@powerhousedao/pieces-framework/workflow";
import { setSelectedNode } from "@powerhousedao/reactor-browser";
import { Button } from "./controls.js";

// Beyond this many, the rest are counted.
const SHOWN = 3;

function shortId(id: string): string {
  return id.length > 16 ? `${id.slice(0, 6)}…${id.slice(-6)}` : id;
}

function revisionText(reference: DocumentReference): string {
  const scopes = Object.entries(reference.revision)
    .map(([scope, count]) => `${scope} ${count}`)
    .join(" · ");
  return reference.branch === "main"
    ? scopes
    : `${reference.branch}: ${scopes}`;
}

function DocumentRefRow(props: { reference: DocumentReference }) {
  const { reference } = props;
  return (
    <li
      aria-label={`Document ${reference.documentId}`}
      className="flex items-center gap-2"
    >
      <div className="min-w-0 flex-1 text-xs">
        <div className="flex min-w-0 items-baseline gap-1.5">
          <span className="truncate font-medium text-foreground">
            {reference.documentType}
          </span>
          <span
            className="shrink-0 font-mono text-[11px] text-muted-foreground"
            title={reference.documentId}
          >
            {shortId(reference.documentId)}
          </span>
        </div>
        <div className="truncate text-[11px] text-muted-foreground">
          Revision {revisionText(reference)}
        </div>
      </div>
      <Button
        size="sm"
        onClick={() => setSelectedNode(reference.documentId)}
        aria-label={`Open document ${reference.documentId}`}
      >
        Open document
      </Button>
    </li>
  );
}

export function DocumentRefs(props: { references: DocumentReference[] }) {
  const { references } = props;
  const hidden = references.length - SHOWN;
  return (
    <div
      role="group"
      aria-label="Document references"
      className="flex flex-col gap-1.5"
    >
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {references.slice(0, SHOWN).map((reference, index) => (
          <DocumentRefRow
            key={`${reference.documentId}-${index}`}
            reference={reference}
          />
        ))}
      </ul>
      {hidden > 0 ? (
        <p className="text-[11px] text-muted-foreground">
          and {hidden} more in the data below
        </p>
      ) : null}
      <p className="text-[11px] text-muted-foreground">
        The run kept a reference, not the state. Opening shows the document as
        it is now: past revisions can&apos;t be read yet (#3179).
      </p>
    </div>
  );
}
