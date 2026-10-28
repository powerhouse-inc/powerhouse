import { useEffect, useState, type ChangeEvent } from "react";
import { MAX_IMPORT_BYTES } from "../../components/HostImportPanel.js";
import { baseDigest, type Project } from "../../controller/api.js";
import { errorMessage } from "../../controller/client.js";
import { parseHostExport } from "../../lib/host-import.js";
import type { BuilderClient } from "../client.js";
import { NO_CONTROLLER } from "../copy.js";
import { newDraft, type BuilderDraft } from "../draft.js";

type Source = "project" | "import";

const SOURCES: { value: Source; label: string; sub: string }[] = [
  {
    value: "project",
    label: "From a project host",
    sub: "Load a host from a project the monitor's controller serves.",
  },
  {
    value: "import",
    label: "Import an export",
    sub: "Open or paste the file that ph host export writes.",
  },
];

function ProjectHost({
  client,
  onDraft,
}: {
  readonly client: BuilderClient;
  readonly onDraft: (draft: BuilderDraft) => void;
}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState("");
  const [hosts, setHosts] = useState<string[]>([]);
  const [host, setHost] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const abort = new AbortController();
    const aborted = () => abort.signal.aborted;
    void (async () => {
      try {
        const listed = await client.projects();
        if (aborted()) return;
        setProjects(listed);
        setProject((current) => current || (listed.at(0)?.root ?? ""));
      } catch (caught) {
        if (!aborted()) setError(errorMessage(caught));
      }
    })();
    return () => abort.abort();
  }, [client]);

  useEffect(() => {
    if (!project) return;
    const abort = new AbortController();
    const aborted = () => abort.signal.aborted;
    void (async () => {
      try {
        const listed = await client.hosts(project);
        if (aborted()) return;
        setHosts(listed);
        setHost((current) =>
          listed.includes(current) ? current : (listed.at(0) ?? ""),
        );
      } catch (caught) {
        if (!aborted()) setError(errorMessage(caught));
      }
    })();
    return () => abort.abort();
  }, [client, project]);

  const load = async () => {
    setBusy(true);
    setError("");
    try {
      const loaded = await client.exportHost(project, host);
      onDraft(
        newDraft(
          { kind: "project", project, host, export: loaded.export },
          loaded.baseDigest,
        ),
      );
    } catch (caught) {
      setError(errorMessage(caught));
    }
    setBusy(false);
  };

  return (
    <div className="hb-card hb-sec">
      <label className="hb-field">
        <span className="hb-flabel">Project</span>
        <select
          onChange={(event) => setProject(event.target.value)}
          value={project}
        >
          {projects.map((candidate) => (
            <option key={candidate.root} value={candidate.root}>
              {candidate.name} · {candidate.root}
            </option>
          ))}
        </select>
      </label>
      <label className="hb-field">
        <span className="hb-flabel">Host</span>
        <select onChange={(event) => setHost(event.target.value)} value={host}>
          {hosts.map((candidate) => (
            <option key={candidate} value={candidate}>
              {candidate}
            </option>
          ))}
        </select>
      </label>
      <div>
        <button
          className="hb-btn hb-btn-primary"
          disabled={busy || !project || !host}
          onClick={() => void load()}
          type="button"
        >
          {busy ? "Loading…" : "Load host"}
        </button>
      </div>
      {error ? <p className="hb-error">{error}</p> : null}
    </div>
  );
}

function ImportExport({
  onDraft,
}: {
  readonly onDraft: (draft: BuilderDraft) => void;
}) {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | undefined>();
  const [errors, setErrors] = useState<string[]>([]);

  const readFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      setErrors([`${file.name} is larger than 5 MB.`]);
      return;
    }
    try {
      setText(await file.text());
      setFileName(file.name);
      setErrors([]);
    } catch (caught) {
      setErrors([`Couldn't read ${file.name}: ${errorMessage(caught)}`]);
    }
  };

  const load = async () => {
    const parsed = parseHostExport(text);
    if (!parsed.export) {
      setErrors(
        parsed.issues.map((issue) =>
          issue.path ? `${issue.message} (${issue.path})` : issue.message,
        ),
      );
      return;
    }
    try {
      const digest = await baseDigest(parsed.export);
      onDraft(
        newDraft(
          {
            kind: "import",
            export: parsed.export,
            ...(fileName ? { fileName } : {}),
          },
          digest,
        ),
      );
    } catch (caught) {
      setErrors([errorMessage(caught)]);
    }
  };

  return (
    <div className="hb-card hb-sec">
      <label className="hb-field">
        <span className="hb-flabel">Export file</span>
        <input
          accept=".json,application/json"
          onChange={(event) => void readFile(event)}
          type="file"
        />
      </label>
      <label className="hb-field">
        <span className="hb-flabel">Or paste it</span>
        <textarea
          onChange={(event) => {
            setText(event.target.value);
            setFileName(undefined);
          }}
          rows={6}
          value={text}
        />
      </label>
      <div>
        <button
          className="hb-btn hb-btn-primary"
          disabled={text.trim() === ""}
          onClick={() => void load()}
          type="button"
        >
          Import
        </button>
      </div>
      {errors.length > 0 ? (
        <ul className="hb-issues">
          {errors.map((message) => (
            <li className="hb-error" key={message}>
              {message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function StartStep({
  client,
  draft,
  onDraft,
  onDiscard,
}: {
  readonly client?: BuilderClient;
  readonly draft?: BuilderDraft;
  readonly onDraft: (draft: BuilderDraft) => void;
  readonly onDiscard: () => void;
}) {
  const [source, setSource] = useState<Source>(client ? "project" : "import");
  return (
    <section className="hb-step">
      <h2 className="hb-h2">Start</h2>
      <p className="hb-note">
        Pick the host to start from. Everything stays editable afterwards.
      </p>
      {draft ? (
        <div className="hb-banner">
          <span>Loading another host replaces the current draft.</span>
          <button className="hb-link" onClick={onDiscard} type="button">
            Discard the draft
          </button>
        </div>
      ) : null}
      <div className="hb-sources">
        {SOURCES.map((option) => {
          const disabled = option.value === "project" && !client;
          return (
            <div key={option.value}>
              <button
                aria-pressed={source === option.value}
                className="hb-src"
                disabled={disabled}
                onClick={() => setSource(option.value)}
                type="button"
              >
                <span className="hb-radio" />
                <span>
                  <span className="hb-flabel">{option.label}</span>
                  <span className="hb-note hb-block">{option.sub}</span>
                </span>
              </button>
              {disabled ? (
                <p className="hb-why">
                  <b>{option.label}:</b> {NO_CONTROLLER}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
      {source === "project" && client ? (
        <ProjectHost client={client} onDraft={onDraft} />
      ) : null}
      {source === "import" ? <ImportExport onDraft={onDraft} /> : null}
    </section>
  );
}
