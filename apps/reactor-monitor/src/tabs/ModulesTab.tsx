/**
 * The document models a reactor has registered, with versions (multi-reactor
 * §2). Reads the inspection surface's `listDocumentModels`, so it works
 * uniformly for local, worker and remote reactors — a remote one answers over
 * the inspection subgraph through `RemoteInspectorClient`.
 *
 * Plain CSS and a 2s poll loop, forked from QueueTab rather than pulling in the
 * design system (see that file's header note).
 */
import type {
  IInspector,
  InspectorDocumentModelInfo,
} from "@powerhousedao/reactor";
import { useCallback, useEffect, useState } from "react";

export type ModulesTabProps = {
  readonly inspector: IInspector;
};

const POLL_INTERVAL_MS = 2000;

export function ModulesTab({ inspector }: ModulesTabProps) {
  const [models, setModels] = useState<InspectorDocumentModelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await inspector.listDocumentModels();
      setModels(next);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [inspector]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks-extra/set-state-in-effect
    void load();
    const interval = setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [load]);

  const sorted = [...models].sort((a, b) =>
    a.documentType.localeCompare(b.documentType),
  );

  return (
    <div className="rm-tab">
      <div className="rm-tab-header">
        <h2>Modules</h2>
        <div className="rm-actions">
          <button
            className="rm-btn"
            disabled={loading}
            onClick={() => {
              setLoading(true);
              void load();
            }}
            type="button"
          >
            Refresh
          </button>
        </div>
      </div>

      {error ? <p className="rm-error">{error}</p> : null}

      <div className="rm-stat-bar" data-testid="modules-counts">
        <span>
          Registered models: <strong>{sorted.length}</strong>
        </span>
      </div>

      <div className="rm-table-wrap">
        <table className="rm-table">
          <thead>
            <tr>
              <th>Document type</th>
              <th>Name</th>
              <th>Version</th>
              <th>Supported versions</th>
            </tr>
          </thead>
          <tbody>
            {loading && sorted.length === 0 ? (
              <tr>
                <td className="rm-table-empty" colSpan={4}>
                  Loading...
                </td>
              </tr>
            ) : sorted.length === 0 ? (
              <tr>
                <td className="rm-table-empty" colSpan={4}>
                  No document models registered.
                </td>
              </tr>
            ) : (
              sorted.map((model) => (
                <tr data-testid="modules-row" key={model.documentType}>
                  <td title={model.documentType}>
                    <code>{model.documentType}</code>
                  </td>
                  <td>{model.name}</td>
                  <td>{model.version}</td>
                  <td>{model.supportedVersions.join(", ")}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="rm-note">Showing {sorted.length} model(s)</p>
    </div>
  );
}

export default ModulesTab;
