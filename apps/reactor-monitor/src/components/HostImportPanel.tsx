import type { ReactorDescriptor } from "@powerhousedao/reactor-monitor";
import {
  switchboardOfDrive,
  type HostExport,
} from "@powerhousedao/host-core/schema";
import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import {
  EXPORT_FILE,
  parseHostExport,
  planImport,
  type ImportIssue,
  type ImportRow,
} from "../lib/host-import.js";
import type { MonitoringSetSource } from "../monitoring-sets.js";

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export type HostImportRequest = {
  readonly setName: string;
  readonly descriptors: ReactorDescriptor[];
  readonly source: MonitoringSetSource;
  readonly activate: boolean;
};

type ReadResult = { text: string } | { error: string };

async function readHostFile(file: File): Promise<ReadResult> {
  if (file.size > MAX_IMPORT_BYTES) {
    return {
      error: `${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB; the limit is 5 MB.`,
    };
  }
  try {
    return { text: await file.text() };
  } catch (error) {
    return {
      error: `Could not read ${file.name}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

type RowState = {
  readonly row: ImportRow;
  include: boolean;
  name: string;
  url: string;
};

type Review = {
  readonly exp: HostExport;
  readonly setName: string;
  readonly memberCount: number;
  rows: RowState[];
};

type Loaded = { issues: ImportIssue[]; review?: Review };

function readIssue(message: string): Loaded {
  return {
    issues: [
      {
        severity: "error",
        stage: "load",
        file: EXPORT_FILE,
        path: "",
        message,
      },
    ],
  };
}

function load(text: string): Loaded {
  try {
    return parseAndPlan(text);
  } catch (error) {
    return readIssue(
      `Could not read the export: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function parseAndPlan(text: string): Loaded {
  const parsed = parseHostExport(text);
  if (!parsed.export) {
    return { issues: parsed.issues };
  }
  const plan = planImport(parsed.export);
  return {
    issues: [...parsed.issues, ...plan.issues],
    review: {
      exp: parsed.export,
      setName: plan.setName,
      memberCount: plan.memberCount,
      rows: plan.rows.map((row) => ({
        row,
        include: row.include,
        name: row.descriptor.name,
        url: row.url?.value ?? "",
      })),
    },
  };
}

function loadResult(result: ReadResult): Loaded {
  return "error" in result ? readIssue(result.error) : load(result.text);
}

function blockers(rows: readonly RowState[]): string[] {
  const included = rows.filter((state) => state.include);
  if (included.length === 0) {
    return ["Include at least one row."];
  }
  const reasons: string[] = [];
  const seen = new Set<string>();
  for (const state of included) {
    const name = state.name.trim();
    if (!name) {
      reasons.push(`A row of ${state.row.member} has no name.`);
    } else if (seen.has(name)) {
      reasons.push(`Two rows are named "${name}".`);
    }
    seen.add(name);
    if (
      state.row.descriptor.kind === "remote" &&
      !switchboardOfDrive(state.url.trim())
    ) {
      reasons.push(
        `${name || state.row.member} needs a switchboard drive address (<switchboard>/d/<slug>).`,
      );
    }
  }
  return reasons;
}

function descriptorOf(state: RowState): ReactorDescriptor {
  const descriptor: ReactorDescriptor = {
    ...state.row.descriptor,
    name: state.name.trim(),
  };
  if (descriptor.kind === "remote") {
    descriptor.remote = { url: state.url.trim() };
  }
  return descriptor;
}

function statusOf(state: RowState): string {
  if (state.row.excluded) {
    return `excluded: ${state.row.excluded}`;
  }
  if (state.row.descriptor.kind !== "remote") {
    return "ok";
  }
  if (!state.url.trim()) {
    return "needs URL";
  }
  return state.row.url?.derived && state.url === state.row.url.value
    ? "derived, unverified"
    : "ok";
}

function IssueList({ issues }: { readonly issues: readonly ImportIssue[] }) {
  const byFile = new Map<string, ImportIssue[]>();
  for (const issue of issues) {
    byFile.set(issue.file, [...(byFile.get(issue.file) ?? []), issue]);
  }
  return (
    <div className="rm-import__issues" data-testid="host-import-issues">
      {[...byFile].map(([file, fileIssues]) => (
        <div key={file}>
          <h3>{file}</h3>
          <ul>
            {fileIssues.map((issue, index) => (
              <li
                className={`rm-import__issue rm-import__issue--${issue.severity}`}
                key={index}
              >
                <span className="rm-import__severity">{issue.severity}</span>
                {issue.path ? <code>{issue.path}</code> : null}
                <span>{issue.message}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export type HostImportPanelProps = {
  readonly onImport: (request: HostImportRequest) => void;
};

/** Loads a `ph host export` (file, paste or drop) and saves it as a set. */
export function HostImportPanel({ onImport }: HostImportPanelProps) {
  const [loaded, setLoaded] = useState<Loaded>();
  const [text, setText] = useState("");
  const [dragging, setDragging] = useState(false);

  // A file dropped anywhere on the page.
  useEffect(() => {
    const hasFiles = (event: DragEvent) =>
      Array.from(event.dataTransfer?.types ?? []).includes("Files");
    // Enter/leave fire per element crossed; the page is left when they balance.
    let depth = 0;
    const onDragEnter = (event: DragEvent) => {
      if (hasFiles(event)) {
        depth += 1;
        setDragging(true);
      }
    };
    const onDragOver = (event: DragEvent) => {
      if (hasFiles(event)) {
        event.preventDefault();
      }
    };
    const onDragLeave = (event: DragEvent) => {
      if (hasFiles(event)) {
        depth = Math.max(0, depth - 1);
        if (depth === 0) {
          setDragging(false);
        }
      }
    };
    const onDrop = async (event: DragEvent) => {
      depth = 0;
      setDragging(false);
      const file = event.dataTransfer?.files[0];
      if (!file) {
        return;
      }
      event.preventDefault();
      setLoaded(loadResult(await readHostFile(file)));
    };
    const drop = (event: DragEvent) => void onDrop(event);
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", drop);
    };
  }, []);

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    setLoaded(loadResult(await readHostFile(file)));
    input.value = "";
  };

  const updateRow = useCallback(
    (
      index: number,
      patch: Partial<Pick<RowState, "include" | "name" | "url">>,
    ) => {
      setLoaded((current) => {
        if (!current?.review) {
          return current;
        }
        const rows = current.review.rows.map((state, at) =>
          at === index ? { ...state, ...patch } : state,
        );
        return { ...current, review: { ...current.review, rows } };
      });
    },
    [],
  );

  const review = loaded?.review;
  const blocked = review ? blockers(review.rows) : [];

  const save = (activate: boolean) => {
    if (!review || blocked.length > 0) {
      return;
    }
    onImport({
      setName: review.setName,
      descriptors: review.rows
        .filter((state) => state.include)
        .map(descriptorOf),
      source: { project: { ...review.exp.project }, host: review.exp.name },
      activate,
    });
    setLoaded(undefined);
    setText("");
  };

  return (
    <section aria-label="Import host" className="rm-import">
      <h2>Import host</h2>
      {dragging ? (
        <div className="rm-import__overlay">
          Drop an exported host (ph host export) to import it
        </div>
      ) : null}
      <label className="rm-import__file">
        Import host…
        <input
          accept=".json,application/json"
          data-testid="host-import-file"
          onChange={(event) => void handleFile(event)}
          type="file"
        />
      </label>
      <textarea
        aria-label="Host export JSON"
        data-testid="host-import-text"
        onChange={(event) => setText(event.target.value)}
        placeholder="Paste `ph host export <name>` output, or drop the file anywhere"
        rows={3}
        value={text}
      />
      <button
        className="rm-btn rm-btn-small"
        disabled={!text.trim()}
        onClick={() => setLoaded(load(text))}
        type="button"
      >
        Load
      </button>
      {loaded ? (
        <div className="rm-import__review" data-testid="host-import-review">
          {review ? (
            <p className="rm-import__header">
              <strong>{review.exp.project.name}</strong> · host{" "}
              <strong>{review.exp.name}</strong> · {review.memberCount}{" "}
              member(s). Checked in the browser only; run{" "}
              <code>ph host check {review.exp.name}</code> for runner options,
              env values and boot rules.
            </p>
          ) : null}
          {loaded.issues.length > 0 ? (
            <IssueList issues={loaded.issues} />
          ) : null}
          {review ? (
            <>
              <table className="rm-import__rows">
                <thead>
                  <tr>
                    <th>Include</th>
                    <th>Name</th>
                    <th>Kind</th>
                    <th>Storage</th>
                    <th>URL</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {review.rows.map((state, index) => {
                    const id = state.row.descriptor.name;
                    return (
                      <tr key={id}>
                        <td>
                          <input
                            checked={state.include}
                            data-testid={`host-import-include-${id}`}
                            disabled={state.row.excluded !== undefined}
                            onChange={(event) =>
                              updateRow(index, {
                                include: event.target.checked,
                              })
                            }
                            type="checkbox"
                          />
                        </td>
                        <td>
                          <input
                            data-testid={`host-import-name-${id}`}
                            onChange={(event) =>
                              updateRow(index, { name: event.target.value })
                            }
                            type="text"
                            value={state.name}
                          />
                        </td>
                        <td>{state.row.descriptor.kind}</td>
                        <td>{state.row.descriptor.storage?.kind ?? "-"}</td>
                        <td>
                          {state.row.descriptor.kind === "remote" ? (
                            <input
                              data-testid={`host-import-url-${id}`}
                              onChange={(event) =>
                                updateRow(index, { url: event.target.value })
                              }
                              placeholder="http://localhost:4001/d/powerhouse"
                              type="url"
                              value={state.url}
                            />
                          ) : (
                            "-"
                          )}
                        </td>
                        <td data-testid={`host-import-status-${id}`}>
                          {statusOf(state)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {blocked.length > 0 ? (
                <ul className="rm-import__blocked">
                  {blocked.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              ) : null}
              <div className="rm-import__actions">
                <button
                  className="rm-btn rm-btn-small"
                  disabled={blocked.length > 0}
                  onClick={() => save(false)}
                  type="button"
                >
                  Save set
                </button>
                <button
                  className="rm-btn rm-btn-small"
                  disabled={blocked.length > 0}
                  onClick={() => save(true)}
                  type="button"
                >
                  Save &amp; provision
                </button>
              </div>
            </>
          ) : null}
          <button
            className="rm-btn rm-btn-small"
            onClick={() => setLoaded(undefined)}
            type="button"
          >
            Clear
          </button>
        </div>
      ) : null}
    </section>
  );
}

export default HostImportPanel;
