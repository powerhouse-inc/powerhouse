import { useEffect, useState } from "react";
import { errorMessage } from "../../controller/client.js";
import {
  changedFiles,
  hostFiles,
  type HostFile,
} from "../../lib/host-files.js";
import type { BuilderClient } from "../client.js";
import { fixIssuesFirst, START_BLOCKERS } from "../copy.js";
import { sourceOf, type BuilderDraft } from "../draft.js";
import type { StepProps } from "./types.js";

/** Why Start is off, if it is; `served` is undefined while it's being checked. */
export function startBlocker({
  issues,
  controller,
  served,
  wired,
}: {
  readonly issues: number;
  readonly controller: boolean;
  readonly served: boolean | undefined;
  readonly wired: boolean;
}): string | undefined {
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

function download(name: string, content: string): string | undefined {
  try {
    const url = URL.createObjectURL(
      new Blob([content], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
    return undefined;
  } catch (error) {
    return `Couldn't download ${name}: ${errorMessage(error)}`;
  }
}

function Blocked({ label, reason }: { label: string; reason?: string }) {
  return reason ? (
    <p className="hb-why">
      <b>{label}:</b> {reason}
    </p>
  ) : null;
}

export function UseStep({
  client,
  draft,
  engine,
  onStart,
  onSaveSet,
}: StepProps & {
  readonly client?: BuilderClient;
  readonly onStart?: (draft: BuilderDraft) => void;
  readonly onSaveSet?: (setName: string, draft: BuilderDraft) => void;
}) {
  const served = useServed(client, draft);
  const [setName, setSetName] = useState(engine.envelope.name);
  const [status, setStatus] = useState("");
  const blocker = startBlocker({
    issues: engine.issues.length,
    controller: engine.context.controller,
    served,
    wired: onStart !== undefined,
  });
  const saveBlocker = onSaveSet
    ? undefined
    : "Saving as a monitoring set from the builder isn't available yet.";
  const exportFile = `${engine.envelope.name}.host-export.json`;
  const changed = changedFiles(engine.envelope, draft.setters);
  const copyable: HostFile[] =
    changed.length > 0 ? changed : hostFiles(engine.envelope).slice(0, 1);

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
            onClick={() => onStart?.(draft)}
            type="button"
          >
            Start
          </button>
        </div>
        <Blocked label="Start" reason={blocker} />
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
            onClick={() => onSaveSet?.(setName.trim(), draft)}
            type="button"
          >
            Save set
          </button>
        </div>
        <Blocked label="Save set" reason={saveBlocker} />
      </div>
      <div className="hb-card hb-sec">
        <div className="hb-flabel">Take the files</div>
        <p className="hb-note">
          The export opens again with Import an export on the Start step.
        </p>
        <div className="hb-opts">
          <button
            className="hb-btn"
            onClick={() =>
              setStatus(
                download(
                  exportFile,
                  JSON.stringify(engine.envelope, null, 2),
                ) ?? `Downloaded ${exportFile}.`,
              )
            }
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
