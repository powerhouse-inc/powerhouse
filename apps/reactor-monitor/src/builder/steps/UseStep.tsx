import { useEffect, useState } from "react";
import type { HostImportRequest } from "../../components/HostImportPanel.js";
import { errorMessage } from "../../controller/client.js";
import {
  changedFiles,
  hostFiles,
  type HostFile,
} from "../../lib/host-files.js";
import { isBaseChanged } from "../BaseChanged.js";
import type { BuilderClient } from "../client.js";
import { fixIssuesFirst, START_BLOCKERS } from "../copy.js";
import { downloadExport, exportFileName } from "../download.js";
import { sourceOf, type BuilderDraft } from "../draft.js";
import type { BuilderEngine } from "../engine.js";
import { monitoringSetOf, type BuilderRun } from "../run.js";
import type { StepProps } from "./types.js";

/** Why Start is off, if it is; `served` is undefined while it's being checked. */
export function startBlocker({
  issues,
  controller,
  served,
  wired,
  running = false,
}: {
  readonly issues: number;
  readonly controller: boolean;
  readonly served: boolean | undefined;
  readonly wired: boolean;
  readonly running?: boolean;
}): string | undefined {
  if (running) return START_BLOCKERS.running;
  if (issues > 0) return fixIssuesFirst(issues);
  if (!controller) return START_BLOCKERS.noController;
  if (served === undefined) return START_BLOCKERS.checking;
  if (!served) return START_BLOCKERS.notServed;
  if (!wired) return START_BLOCKERS.notWired;
  return undefined;
}

/** Whether the controller serves the project and host the draft comes from. */
function useServed(
  client: BuilderClient | undefined,
  draft: BuilderDraft,
): boolean | undefined {
  const { project, host } = sourceOf(draft);
  const imported = draft.base.kind === "import";
  const asked = `${project}\0${host}`;
  const [answer, setAnswer] = useState<
    { client: BuilderClient; asked: string; served: boolean } | undefined
  >();
  useEffect(() => {
    if (!imported || !client) return;
    const abort = new AbortController();
    const aborted = () => abort.signal.aborted;
    void (async () => {
      let served: boolean;
      try {
        const projects = await client.projects();
        served =
          projects.some((candidate) => candidate.root === project) &&
          (await client.hosts(project)).includes(host);
      } catch {
        served = false;
      }
      if (!aborted()) setAnswer({ client, asked, served });
    })();
    return () => abort.abort();
  }, [client, imported, project, host, asked]);
  if (!imported) return true;
  if (!client) return false;
  return answer?.client === client && answer.asked === asked
    ? answer.served
    : undefined;
}

function Blocked({ label, reason }: { label: string; reason?: string }) {
  return reason ? (
    <p className="hb-why">
      <b>{label}:</b> {reason}
    </p>
  ) : null;
}

function Running({
  run,
  onStop,
}: {
  readonly run: BuilderRun;
  readonly onStop?: () => Promise<void>;
}) {
  const [problem, setProblem] = useState("");
  const stop = async () => {
    setProblem("");
    try {
      await onStop?.();
    } catch (error) {
      setProblem(`Couldn't stop it: ${errorMessage(error)}`);
    }
  };
  return (
    <div className="hb-sub" aria-label="Running copy">
      <p className="hb-note" role="status">
        {run.status === "starting"
          ? "Starting a copy. This can take a minute."
          : run.status === "stopping"
            ? "Stopping the copy…"
            : "Running a copy. Its reactors are in the reactor list."}
      </p>
      {run.problem ? (
        <p className="hb-error">
          Couldn't ask the controller about the copy: {run.problem} Still
          trying.
        </p>
      ) : null}
      <ul className="hb-list">
        {run.reactors.map((reactor) => (
          <li key={reactor.name}>
            <b>{reactor.name}</b>{" "}
            {reactor.url ? (
              <span className="hb-mono hb-note">{reactor.url}</span>
            ) : null}
            {reactor.app ? (
              <a href={reactor.app} rel="noreferrer" target="_blank">
                Open Connect
              </a>
            ) : null}
          </li>
        ))}
        {run.browser.map((name) => (
          <li key={name}>
            <b>{name}</b> <span className="hb-note">runs in this browser</span>
          </li>
        ))}
      </ul>
      <div>
        <button
          className="hb-btn"
          disabled={run.status === "stopping" || run.id === undefined}
          onClick={() => void stop()}
          type="button"
        >
          Stop
        </button>
      </div>
      {problem ? <p className="hb-error">{problem}</p> : null}
    </div>
  );
}

export function UseStep({
  client,
  draft,
  engine,
  run,
  onStart,
  onStop,
  onSaveSet,
  onBaseChanged = () => undefined,
}: StepProps & {
  readonly client?: BuilderClient;
  readonly run?: BuilderRun;
  readonly onStart?: (
    draft: BuilderDraft,
    engine: BuilderEngine,
  ) => Promise<void> | void;
  readonly onStop?: () => Promise<void>;
  readonly onBaseChanged?: () => void;
  /** Returns the name the set was saved under. */
  readonly onSaveSet?: (request: HostImportRequest) => string;
}) {
  const served = useServed(client, draft);
  const [setName, setSetName] = useState(engine.envelope.name);
  const [status, setStatus] = useState("");
  const [saved, setSaved] = useState<string[]>([]);
  const blocker = startBlocker({
    issues: engine.issues.length,
    controller: engine.context.controller,
    served,
    wired: onStart !== undefined,
    running: run !== undefined,
  });
  const set = monitoringSetOf(engine.envelope, setName.trim());
  const saveBlocker = !onSaveSet
    ? "Saving as a monitoring set from the builder isn't available yet."
    : set.request.descriptors.length === 0
      ? "Nothing in this host can be watched from the monitor."
      : undefined;
  const exportFile = exportFileName(engine.envelope);
  const changed = changedFiles(engine.envelope, draft.setters);
  const copyable: HostFile[] =
    changed.length > 0 ? changed : hostFiles(engine.envelope).slice(0, 1);

  const start = async () => {
    if (!onStart) return;
    setStatus("");
    try {
      await onStart(draft, engine);
    } catch (error) {
      if (isBaseChanged(error)) onBaseChanged();
      else setStatus(`Couldn't start: ${errorMessage(error)}`);
    }
  };

  const save = () => {
    if (!onSaveSet) return;
    const name = onSaveSet(set.request);
    setSaved([
      `Saved as the monitoring set "${name}".`,
      ...set.left.map((row) => `${row.name} was left out: ${row.reason}`),
    ]);
  };

  const copy = async (file: HostFile) => {
    try {
      await navigator.clipboard.writeText(file.content);
      setStatus(`Copied ${file.path}.`);
    } catch (error) {
      setStatus(`Couldn't copy ${file.path}: ${errorMessage(error)}`);
    }
  };

  return (
    <section className="hb-step">
      <h2 className="hb-h2">Use it</h2>
      <div className="hb-card hb-sec">
        <div className="hb-flabel">Start it here</div>
        <p className="hb-note">
          The controller starts a copy of this host in a throwaway folder. Your
          project isn't changed. Started copies pick free ports.
        </p>
        <div>
          <button
            className="hb-btn hb-btn-primary"
            disabled={blocker !== undefined}
            onClick={() => void start()}
            type="button"
          >
            Start
          </button>
        </div>
        {run ? null : <Blocked label="Start" reason={blocker} />}
        {run ? <Running onStop={onStop} run={run} /> : null}
      </div>
      <div className="hb-card hb-sec">
        <label className="hb-field">
          <span className="hb-flabel">Save as a monitoring set</span>
          <input
            onChange={(event) => setSetName(event.target.value)}
            type="text"
            value={setName}
          />
        </label>
        <div>
          <button
            className="hb-btn"
            disabled={saveBlocker !== undefined || setName.trim() === ""}
            onClick={save}
            type="button"
          >
            Save set
          </button>
        </div>
        <Blocked label="Save set" reason={saveBlocker} />
        {saved.length > 0 ? (
          <ul aria-label="Saved set" className="hb-list hb-note">
            {saved.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="hb-card hb-sec">
        <div className="hb-flabel">Take the files</div>
        <p className="hb-note">
          The export opens again with Import an export on the Start step.
        </p>
        <div className="hb-opts">
          <button
            className="hb-btn"
            onClick={() => setStatus(downloadExport(engine.envelope))}
            type="button"
          >
            Download {exportFile}
          </button>
          {copyable.map((file) => (
            <button
              className="hb-btn"
              key={file.path}
              onClick={() => void copy(file)}
              type="button"
            >
              {copyable.length === 1 ? "Copy host.js" : `Copy ${file.path}`}
            </button>
          ))}
        </div>
        {status ? (
          <p className="hb-note" role="status">
            {status}
          </p>
        ) : null}
      </div>
    </section>
  );
}
