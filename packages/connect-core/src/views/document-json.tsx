import type { ReactNode } from "react";
import type { DocumentViewProps } from "../router/route-components.js";
import { formatModified } from "./index-table.js";

function Leaf({ value }: { value: unknown }) {
  if (value === null) return <span className="text-core-muted">null</span>;
  if (typeof value === "string") {
    return <span className="text-core-string">{JSON.stringify(value)}</span>;
  }
  return <span className="text-core-number">{JSON.stringify(value)}</span>;
}

function JsonNode(props: { name: ReactNode; value: unknown; open?: boolean }) {
  const { name, value } = props;
  if (value === null || typeof value !== "object") {
    return (
      <div className="pl-4">
        <span className="text-core-muted">{name}: </span>
        <Leaf value={value} />
      </div>
    );
  }
  const entries = Object.entries(value as Record<string, unknown>);
  const isArray = Array.isArray(value);
  const summary = isArray ? `[${entries.length}]` : `{${entries.length}}`;
  return (
    <details open={props.open} className="pl-4">
      <summary className="cursor-pointer select-none">
        <span className="text-core-muted">{name}: </span>
        <span className="text-core-muted">{summary}</span>
      </summary>
      {entries.map(([key, child]) => (
        <JsonNode key={key} name={key} value={child} />
      ))}
    </details>
  );
}

/** Core's document fallback: the document's state, read-only, as a JSON tree. */
export function DocumentJson({ document }: DocumentViewProps) {
  const { header } = document;
  const revisions = Object.entries(header.revision);
  const operations = revisions.reduce((sum, [, count]) => sum + count, 0);
  const state = document.state as Record<string, unknown>;
  const scopes = ["global", "local"].filter((scope) => scope in state);
  return (
    <div className="p-6 font-mono text-sm text-core-fg">
      <h1 className="mb-1 text-xl font-semibold">{header.name || header.id}</h1>
      <dl className="mb-4 grid grid-cols-[max-content_1fr] gap-x-4 text-core-muted">
        <dt>Type</dt>
        <dd>{header.documentType}</dd>
        <dt>Id</dt>
        <dd>{header.id}</dd>
        <dt>Last modified</dt>
        <dd>{formatModified(header.lastModifiedAtUtcIso)}</dd>
        <dt>Operations</dt>
        <dd data-testid="operation-count">
          {operations}
          {revisions.length > 0 &&
            ` (${revisions.map(([scope, count]) => `${scope} ${count}`).join(", ")})`}
        </dd>
      </dl>
      <p className="mb-2 text-core-muted">
        No editor is installed for this document type; its state is shown
        read-only.
      </p>
      <div aria-label="Document state" className="-ml-4">
        {scopes.map((scope) => (
          <JsonNode key={scope} name={scope} value={state[scope]} open />
        ))}
      </div>
    </div>
  );
}
