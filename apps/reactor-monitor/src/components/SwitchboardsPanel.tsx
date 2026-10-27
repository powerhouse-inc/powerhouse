import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  BROWSER_ENV_ALLOWLIST,
  isBrowserEnvKey,
  MAX_ENV_ENTRIES,
  type Instance,
  type LogLine,
  type Project,
} from "../controller/api.js";
import {
  ControllerRequestError,
  type ControllerClient,
  type HostIssue,
} from "../controller/client.js";
import type { ManagedDescriptors } from "../controller/use-managed-descriptors.js";
import type { MonitoringSetSource } from "../monitoring-sets.js";

const LOG_LINES_KEPT = 200;
const BUSY = new Set(["starting", "stopping"]);

/** INSPECTION_ADMIN_ENABLED mounts the levers; ADMINS lists who may pull them. */
export const ADMIN_PRESET = [
  { key: "INSPECTION_ADMIN_ENABLED", value: "true" },
  { key: "AUTH_ENABLED", value: "true" },
  { key: "ADMINS", value: "" },
] as const;

export interface EnvRow {
  id: number;
  key: string;
  value: string;
}

/** Why a row cannot be sent, if it cannot. */
export function envRowProblem(
  row: EnvRow,
  rows: readonly EnvRow[],
): string | undefined {
  const key = row.key.trim();
  if (!key) return row.value ? "key is required" : undefined;
  if (!isBrowserEnvKey(key)) return "not on the browser env allowlist";
  if (key === "ADMINS" && !row.value.trim()) return "needs an admin address";
  if (rows.some((other) => other.id !== row.id && other.key.trim() === key)) {
    return "duplicate key";
  }
  return undefined;
}

function envOf(rows: readonly EnvRow[]): Record<string, string> {
  return Object.fromEntries(
    rows
      .filter((row) => row.key.trim())
      .map((row) => [row.key.trim(), row.value]),
  );
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function IssueTable({
  issues,
}: {
  readonly issues: readonly HostIssue[];
}): ReactNode {
  return (
    <div className="rm-table-wrap">
      <table
        className="rm-table rm-switchboards__issues"
        data-testid="switchboards-issues"
      >
        <thead>
          <tr>
            <th>Stage</th>
            <th>Path</th>
            <th>Message</th>
          </tr>
        </thead>
        <tbody>
          {issues.map((issue, index) => (
            <tr key={`${issue.path}:${index}`}>
              <td>{issue.stage}</td>
              <td>
                <code>{issue.path || "(root)"}</code>
              </td>
              <td>
                {issue.message}
                {issue.hint ? (
                  <span className="rm-note"> {issue.hint}</span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type Logs = { next: number; lines: LogLine[] };

function InstanceRow({
  instance,
  projectName,
  attached,
  logs,
  onToggleLogs,
  onAttach,
  onStop,
}: {
  readonly instance: Instance;
  readonly projectName: string;
  readonly attached: boolean;
  readonly logs: Logs | undefined;
  readonly onToggleLogs: () => void;
  readonly onAttach: () => void;
  readonly onStop: () => void;
}): ReactNode {
  const live = !["exited", "failed"].includes(instance.status);
  const badge =
    instance.status === "running"
      ? "rm-badge rm-badge-ok"
      : instance.status === "failed"
        ? "rm-badge rm-badge-error"
        : "rm-badge";
  return (
    <li
      className="rm-switchboards__instance"
      data-testid={`switchboard-${instance.id}`}
    >
      <div className="rm-switchboards__instance-head">
        <strong>{instance.host}</strong>
        <span className="rm-note">{projectName}</span>
        <span className={badge}>{instance.status}</span>
      </div>
      {instance.outputs ? (
        <dl className="rm-switchboards__outputs">
          <dt>graphql</dt>
          <dd>
            <code>{instance.outputs.graphql}</code>
          </dd>
          {Object.entries(instance.outputs.drives).map(([name, drive]) => (
            <div key={name}>
              <dt>drive {name}</dt>
              <dd>
                <code>{drive.url}</code>
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {instance.pid ? <p className="rm-note">pid {instance.pid}</p> : null}
      {instance.exit ? (
        <p className="rm-note">
          exit {instance.exit.code ?? instance.exit.signal}
          {instance.exit.forced ? " (killed)" : ""}
        </p>
      ) : null}
      {instance.error ? (
        <>
          <p className="rm-error">
            {instance.error.phase}: {instance.error.message}
          </p>
          {instance.error.tail ? (
            <pre className="rm-switchboards__log">{instance.error.tail}</pre>
          ) : null}
        </>
      ) : null}
      <div className="rm-switchboards__actions">
        {instance.status === "running" && !attached ? (
          <button
            className="rm-btn rm-btn-small"
            onClick={onAttach}
            type="button"
          >
            Attach
          </button>
        ) : null}
        {attached ? <span className="rm-note">attached</span> : null}
        <button
          className="rm-btn rm-btn-small"
          onClick={onToggleLogs}
          type="button"
        >
          {logs ? "Hide logs" : "Logs"}
        </button>
        <button
          className={
            live ? "rm-btn rm-btn-small rm-btn-warn" : "rm-btn rm-btn-small"
          }
          disabled={instance.status === "stopping"}
          onClick={onStop}
          type="button"
        >
          {live ? "Stop" : "Dismiss"}
        </button>
      </div>
      {logs ? (
        <pre
          className="rm-switchboards__log"
          data-testid="switchboard-logs"
          ref={(pre) => {
            // A tail: keep the newest lines in view.
            if (pre) pre.scrollTop = pre.scrollHeight;
          }}
        >
          {logs.lines.length === 0
            ? "(no output yet)"
            : logs.lines.map((line) => line.text).join("\n")}
        </pre>
      ) : null}
    </li>
  );
}

export interface SwitchboardsPanelProps {
  readonly managed: ManagedDescriptors;
  /** The active set's `ph host export` provenance, when it was imported. */
  readonly source?: MonitoringSetSource;
  readonly pollMs?: { readonly busy: number; readonly idle: number };
}

export function SwitchboardsPanel({
  managed,
  source,
  pollMs = { busy: 1000, idle: 3000 },
}: SwitchboardsPanelProps): ReactNode {
  const { client } = managed;
  return (
    <aside className="rm-switchboards" aria-label="Switchboards">
      <h2>Switchboards</h2>
      {managed.notices.length > 0 ? (
        <ul
          className="rm-switchboards__notices"
          data-testid="switchboards-notices"
        >
          {managed.notices.map((notice) => (
            <li key={notice.id}>
              {notice.text}
              <button
                aria-label="Dismiss notice"
                className="rm-btn rm-btn-small"
                onClick={() => managed.dismissNotice(notice.id)}
                type="button"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {managed.withheld.length > 0 ? (
        <ul
          className="rm-switchboards__withheld"
          data-testid="switchboards-withheld"
        >
          {managed.withheld.map((entry) => (
            <li key={entry.name}>
              <strong>{entry.name}</strong>{" "}
              <span className="rm-note">withheld: {entry.reason}</span>
              <button
                className="rm-btn rm-btn-small"
                onClick={() => managed.forget(entry.name)}
                type="button"
              >
                Forget
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {client ? (
        <ControllerSection
          client={client}
          managed={managed}
          pollMs={pollMs}
          source={source}
        />
      ) : (
        <p className="rm-note" data-testid="switchboards-no-controller">
          No controller on this page, so switchboards cannot be started here.
          Run the monitor with PH_MONITOR_PROJECT_ROOTS set (pnpm dev) or with
          pnpm serve --project &lt;root&gt;.
        </p>
      )}
    </aside>
  );
}

function ControllerSection({
  client,
  managed,
  source,
  pollMs,
}: {
  readonly client: ControllerClient;
  readonly managed: ManagedDescriptors;
  readonly source: MonitoringSetSource | undefined;
  readonly pollMs: { readonly busy: number; readonly idle: number };
}): ReactNode {
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState("");
  const [hosts, setHosts] = useState<string[]>([]);
  const [host, setHost] = useState("");
  const [rows, setRows] = useState<EnvRow[]>([]);
  const nextRow = useRef(0);
  const [issues, setIssues] = useState<readonly HostIssue[] | undefined>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [pollError, setPollError] = useState("");
  const [logs, setLogs] = useState<Record<string, Logs>>({});

  const managedRef = useRef(managed);
  const logsRef = useRef(logs);
  useEffect(() => {
    managedRef.current = managed;
    logsRef.current = logs;
  });
  /** Instances this panel started: each attaches once it is running. */
  const pending = useRef(new Set<string>());
  const refresh = useRef<() => void>(() => undefined);

  useEffect(() => {
    const abort = new AbortController();
    const aborted = () => abort.signal.aborted;
    void (async () => {
      try {
        const listed = await client.projects();
        if (aborted()) return;
        setProjects(listed);
        // An allowlisted parent is listed too, usually without hosts/ of its own.
        let first = listed.at(0)?.root ?? "";
        for (const candidate of listed) {
          if ((await client.hosts(candidate.root)).length > 0) {
            first = candidate.root;
            break;
          }
        }
        if (aborted()) return;
        setProject((current) => current || first);
      } catch (e) {
        if (!aborted()) setError(messageOf(e));
      }
    })();
    return () => abort.abort();
  }, [client]);

  useEffect(() => {
    if (!project) return;
    const abort = new AbortController();
    void (async () => {
      try {
        const listed = await client.hosts(project);
        if (abort.signal.aborted) return;
        setHosts(listed);
        setHost((current) =>
          listed.includes(current) ? current : (listed.at(0) ?? ""),
        );
      } catch (e) {
        if (!abort.signal.aborted) setError(messageOf(e));
      }
    })();
    return () => abort.abort();
  }, [client, project]);

  useEffect(() => {
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let polling = false;
    let again = false;

    const pollLogs = async (listed: readonly Instance[]) => {
      const open = Object.entries(logsRef.current).filter(([id]) =>
        listed.some((instance) => instance.id === id),
      );
      for (const [id, current] of open) {
        try {
          const page = await client.logs(id, current.next);
          if (abort.signal.aborted) return;
          setLogs((previous) => {
            const kept = previous[id] as Logs | undefined;
            if (!kept) return previous;
            const lines = [...kept.lines, ...page.lines];
            return {
              ...previous,
              [id]: { next: page.next, lines: lines.slice(-LOG_LINES_KEPT) },
            };
          });
        } catch {
          // The instance went away between list and logs.
        }
      }
    };

    const poll = async (): Promise<void> => {
      if (polling) {
        again = true;
        return;
      }
      polling = true;
      clearTimeout(timer);
      let changing = false;
      try {
        const listed = await client.list();
        if (abort.signal.aborted) return;
        setInstances(listed);
        setPollError("");
        managedRef.current.reconcile(listed);
        for (const instance of listed) {
          if (!pending.current.has(instance.id)) continue;
          if (instance.status === "running") {
            pending.current.delete(instance.id);
            managedRef.current.attach(instance);
          } else if (instance.status !== "starting") {
            pending.current.delete(instance.id);
          }
        }
        changing = listed.some((instance) => BUSY.has(instance.status));
        await pollLogs(listed);
      } catch (e) {
        if (!abort.signal.aborted) setPollError(messageOf(e));
      } finally {
        polling = false;
      }
      if (abort.signal.aborted) return;
      if (again) {
        again = false;
        void poll();
        return;
      }
      timer = setTimeout(
        () => void poll(),
        changing ? pollMs.busy : pollMs.idle,
      );
    };

    refresh.current = () => void poll();
    void poll();
    return () => {
      abort.abort();
      clearTimeout(timer);
      refresh.current = () => undefined;
    };
  }, [client, pollMs.busy, pollMs.idle]);

  const problems = rows.map((row) => envRowProblem(row, rows));
  const envBlocked =
    problems.some(Boolean) ||
    rows.filter((r) => r.key.trim()).length > MAX_ENV_ENTRIES;

  const addRows = (added: readonly { key: string; value: string }[]) => {
    setRows((previous) => [
      ...previous,
      ...added
        .filter(({ key }) => !previous.some((row) => row.key.trim() === key))
        .map(({ key, value }) => ({ id: nextRow.current++, key, value })),
    ]);
  };

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      if (e instanceof ControllerRequestError && e.issues) setIssues(e.issues);
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const check = () =>
    run(async () => {
      setIssues(undefined);
      setIssues(await client.check({ project, host, env: envOf(rows) }));
    });

  const start = (request: { project: string; host: string }) =>
    run(async () => {
      setIssues(undefined);
      const started = await client.start({ ...request, env: envOf(rows) });
      pending.current.add(started.id);
      setInstances((previous) => [...previous, started]);
      refresh.current();
    });

  const stop = (id: string) =>
    run(async () => {
      await managed.stopInstance(id);
      setLogs(({ [id]: _closed, ...rest }) => rest);
      refresh.current();
    });

  const stopAll = () =>
    run(async () => {
      await managed.stopAll();
      setLogs({});
      refresh.current();
    });

  const toggleLogs = (id: string) => {
    if (id in logs) {
      setLogs(({ [id]: _closed, ...rest }) => rest);
      return;
    }
    const opened = { next: 0, lines: [] };
    logsRef.current = { ...logsRef.current, [id]: opened };
    setLogs((previous) => ({ ...previous, [id]: opened }));
    refresh.current();
  };

  const projectName = (root: string) =>
    projects.find((p) => p.root === root)?.name ??
    root.split(/[\\/]/).pop() ??
    root;

  return (
    <>
      {source ? (
        <div
          className="rm-switchboards__source"
          data-testid="switchboards-source"
        >
          <span className="rm-note">
            This set was exported from <code>{source.host}</code> in{" "}
            {source.project.name}.
          </span>
          <button
            className="rm-btn rm-btn-small"
            disabled={busy || envBlocked}
            onClick={() =>
              void start({ project: source.project.root, host: source.host })
            }
            type="button"
          >
            Start this host
          </button>
        </div>
      ) : null}
      <label>
        Project
        <select onChange={(e) => setProject(e.target.value)} value={project}>
          {projects.map((p) => (
            <option key={p.root} title={p.root} value={p.root}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Host
        <select onChange={(e) => setHost(e.target.value)} value={host}>
          {hosts.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
      </label>
      {project && hosts.length === 0 ? (
        <p className="rm-note">
          This project has no hosts/&lt;name&gt;/host.js.
        </p>
      ) : null}
      <fieldset className="rm-switchboards__env">
        <legend>Env</legend>
        {rows.map((row, index) => (
          <div className="rm-switchboards__env-row" key={row.id}>
            <input
              aria-label="Env key"
              list="rm-switchboards-env-keys"
              onChange={(e) =>
                setRows((previous) =>
                  previous.map((r) =>
                    r.id === row.id ? { ...r, key: e.target.value } : r,
                  ),
                )
              }
              placeholder="KEY"
              spellCheck={false}
              value={row.key}
            />
            <input
              aria-label={`Value of ${row.key || "env row"}`}
              onChange={(e) =>
                setRows((previous) =>
                  previous.map((r) =>
                    r.id === row.id ? { ...r, value: e.target.value } : r,
                  ),
                )
              }
              placeholder={row.key === "ADMINS" ? "0x… admin address" : "value"}
              spellCheck={false}
              value={row.value}
            />
            <button
              aria-label={`Remove ${row.key || "env row"}`}
              className="rm-btn rm-btn-small"
              onClick={() =>
                setRows((previous) => previous.filter((r) => r.id !== row.id))
              }
              type="button"
            >
              ×
            </button>
            {problems[index] ? (
              <p className="rm-error rm-switchboards__env-problem">
                {row.key.trim()}: {problems[index]}
              </p>
            ) : null}
          </div>
        ))}
        <datalist id="rm-switchboards-env-keys">
          {BROWSER_ENV_ALLOWLIST.keys.map((key) => (
            <option key={key} value={key} />
          ))}
        </datalist>
        <div className="rm-switchboards__actions">
          <button
            className="rm-btn rm-btn-small"
            onClick={() => addRows([{ key: "", value: "" }])}
            type="button"
          >
            Add env
          </button>
          <button
            className="rm-btn rm-btn-small"
            onClick={() => addRows(ADMIN_PRESET)}
            type="button"
          >
            Admin preset
          </button>
        </div>
        <details className="rm-note">
          <summary>Allowed keys</summary>
          {BROWSER_ENV_ALLOWLIST.keys.join(", ")}, and any{" "}
          {BROWSER_ENV_ALLOWLIST.prefixes.map((p) => `${p}*`).join(" or ")} key
          that loads no code. Everything else comes only from the
          controller&apos;s own config.
        </details>
      </fieldset>
      <div className="rm-switchboards__actions">
        <button
          className="rm-btn"
          disabled={busy || envBlocked || !project || !host}
          onClick={() => void check()}
          type="button"
        >
          Check
        </button>
        <button
          className="rm-btn"
          disabled={busy || envBlocked || !project || !host}
          onClick={() => void start({ project, host })}
          type="button"
        >
          Start
        </button>
      </div>
      {error ? (
        <p className="rm-error" data-testid="switchboards-error">
          {error}
        </p>
      ) : null}
      {issues ? (
        issues.length === 0 ? (
          <p className="rm-note" data-testid="switchboards-check-clean">
            No issues.
          </p>
        ) : (
          <IssueTable issues={issues} />
        )
      ) : null}
      {pollError ? <p className="rm-error">{pollError}</p> : null}
      {instances.length > 0 ? (
        <>
          <ul className="rm-switchboards__instances">
            {instances.map((instance) => (
              <InstanceRow
                attached={managed.attachedIds.has(instance.id)}
                instance={instance}
                key={instance.id}
                logs={logs[instance.id]}
                onAttach={() => managed.attach(instance)}
                onStop={() => void stop(instance.id)}
                onToggleLogs={() => toggleLogs(instance.id)}
                projectName={projectName(instance.project)}
              />
            ))}
          </ul>
          <button
            className="rm-btn rm-btn-warn"
            disabled={busy}
            onClick={() => void stopAll()}
            type="button"
          >
            Stop all
          </button>
        </>
      ) : null}
    </>
  );
}

export default SwitchboardsPanel;
