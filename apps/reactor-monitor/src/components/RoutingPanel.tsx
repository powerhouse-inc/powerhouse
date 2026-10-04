/**
 * The Router topology surface (multi-reactor router, stages 1-3 — see
 * docs/plans/2026-10-03-multi-reactor.md, "Router client").
 *
 * A reactor-spanning view rather than a per-reactor tab: the operator picks two
 * or more READY reactors as backends, builds one {@link RoutingReactorClient}
 * over them (a `ManagedReactor` handle IS a router backend — see
 * `lib/router.ts`), and then sees and drives the whole topology through the
 * single client:
 *
 * - {@link RoutingReactorClient.describeRouting} is rendered as a table, each
 *   collection tagged with the {@link RouteSource} evidence behind it
 *   (override / placed / learned / corrected), beside the backend list and each
 *   backend's capability summary (reused from the Overview tab);
 * - operator controls set and clear per-collection overrides and capability
 *   requirements, create a drive through the router, and search across every
 *   backend with a merged result that names which one holds each hit;
 * - the advisory-routing story is made visible: invert an override, drive a
 *   write, and the badge flips `override -> corrected` while the diagnostic log
 *   (wired to the router's `onDiagnostic`) reports the stale override;
 * - the v1 constraints refuse by NAME: a cross-backend batch and a cross-backend
 *   relationship write surface {@link CrossBackendBatchError} /
 *   {@link CrossBackendRelationshipError} rather than a generic failure.
 *
 * Overrides and requirements are the router's CONSTRUCTION-time configuration
 * (`RoutingOptions`), so changing one rebuilds the client over the same
 * backends — the honest model of "reconfigure the topology", and cheap because
 * a router is just a table over clients it already holds. The learned/corrected
 * state a rebuilt client starts without is re-learned on the next operation by
 * the same advisory machinery, which is the whole point of it being advisory.
 */
import type { BatchExecutionRequest } from "@powerhousedao/reactor";
import type {
  ManagedReactor,
  ManagedReactorEntry,
} from "@powerhousedao/reactor-monitor";
import { useManagedReactors } from "@powerhousedao/reactor-monitor/react";
import {
  collectionRequirements,
  eligibleBackends,
  ineligibleReason,
  type CollectionRequirementsInput,
  type ReactorBackend,
  type RouterTableSnapshot,
  type RouteSource,
  type RoutingReactorClient,
} from "@powerhousedao/reactor-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { buildRoutingClient } from "../lib/router.js";
import { capabilityCells } from "../tabs/OverviewTab.js";

/** One line the router reported through `onDiagnostic`, newest last. */
type LogLine = { readonly id: number; readonly text: string };

/** A document returned by a cross-backend find, with the backend that holds it. */
type FindHit = {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly backend: string;
};

/** A named refusal surfaced from a v1 constraint, kept for display. */
type NamedError = { readonly name: string; readonly message: string };

/** The topology a built client was constructed from, kept so a reconfigure can rebuild it. */
type Topology = {
  readonly reactors: readonly ManagedReactor[];
  readonly overrides: Readonly<Record<string, string>>;
  readonly requirements: Readonly<Record<string, CollectionRequirementsInput>>;
};

/** The one requirement toggle the plan calls out (workflows), plus two cheap siblings. */
type RequirementInput = {
  readonly workflows: boolean;
  readonly durableStorage: boolean;
  readonly inspectable: boolean;
};

const DRIVE_TYPE = "powerhouse/document-drive";

function readyReactors(
  entries: readonly ManagedReactorEntry[],
): readonly ManagedReactor[] {
  return entries.flatMap((entry) =>
    entry.status === "ready" ? [entry.reactor] : [],
  );
}

/** The evidence tone: a correction is a win (green), an override a deliberate choice (blue). */
function sourceTone(source: RouteSource): "ok" | "neutral" | "off" {
  switch (source) {
    case "corrected":
      return "ok";
    case "override":
    case "learned":
      return "neutral";
    case "placed":
      return "off";
  }
}

function SourceBadge({ source }: { readonly source: RouteSource }) {
  return (
    <span
      className={`rm-badge rm-badge-${sourceTone(source)}`}
      data-testid="router-source"
    >
      {source}
    </span>
  );
}

/** A compact reuse of the Overview tab's capability rendering: one badge per field. */
function CapabilitySummary({ reactor }: { readonly reactor: ManagedReactor }) {
  return (
    <ul className="rm-router-caps" aria-label={`${reactor.name} capabilities`}>
      {capabilityCells(reactor.capabilities).map((cell) => (
        <li key={cell.label}>
          <span className="rm-cap-label">{cell.label}</span>
          <span className={`rm-badge rm-badge-${cell.tone}`} title={cell.note}>
            {cell.value}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function RoutingPanel() {
  const entries = useManagedReactors();
  const ready = useMemo(() => readyReactors(entries), [entries]);

  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [client, setClient] = useState<RoutingReactorClient | null>(null);
  const [topology, setTopology] = useState<Topology | null>(null);
  const [snapshot, setSnapshot] = useState<RouterTableSnapshot | null>(null);
  const [log, setLog] = useState<readonly LogLine[]>([]);
  const [buildError, setBuildError] = useState("");

  // Control inputs.
  const [overrideKey, setOverrideKey] = useState("");
  const [overrideBackend, setOverrideBackend] = useState("");
  const [reqKey, setReqKey] = useState("");
  const [req, setReq] = useState<RequirementInput>({
    workflows: true,
    durableStorage: false,
    inspectable: false,
  });
  const [driveName, setDriveName] = useState("");
  const [driveTarget, setDriveTarget] = useState("");
  const [findType, setFindType] = useState(DRIVE_TYPE);
  const [batchA, setBatchA] = useState("");
  const [batchB, setBatchB] = useState("");

  // Results.
  const [createResult, setCreateResult] = useState("");
  const [findHits, setFindHits] = useState<readonly FindHit[] | null>(null);
  const [opError, setOpError] = useState("");
  const [batchError, setBatchError] = useState<NamedError | null>(null);
  const [relError, setRelError] = useState<NamedError | null>(null);

  const logCounter = useRef(0);
  const appendLog = useCallback((text: string) => {
    setLog((previous) => [...previous, { id: logCounter.current++, text }]);
  }, []);

  const refresh = useCallback((built: RoutingReactorClient) => {
    setSnapshot(built.describeRouting());
  }, []);

  /**
   * Builds (or rebuilds) the client over `next`. The single path every control
   * funnels through, because overrides and requirements are construction-time
   * configuration: a reconfigure is a rebuild over the same handles.
   */
  const applyTopology = useCallback(
    (next: Topology) => {
      if (next.reactors.length < 2) {
        setBuildError("Select at least two ready reactors to route over.");
        return;
      }
      setBuildError("");
      const built = buildRoutingClient(next.reactors, {
        collections: next.overrides,
        requirements: next.requirements,
        onDiagnostic: (message) => appendLog(message),
      });
      setClient(built);
      setTopology(next);
      refresh(built);
    },
    [appendLog, refresh],
  );

  const handleBuild = useCallback(() => {
    const chosen = ready.filter((reactor) => selected.has(reactor.name));
    setCreateResult("");
    setFindHits(null);
    setBatchError(null);
    setRelError(null);
    setOpError("");
    applyTopology({ reactors: chosen, overrides: {}, requirements: {} });
  }, [applyTopology, ready, selected]);

  const toggle = useCallback((name: string) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }, []);

  const handleSetOverride = useCallback(() => {
    if (!topology || overrideKey.trim() === "" || overrideBackend === "") {
      return;
    }
    applyTopology({
      ...topology,
      overrides: {
        ...topology.overrides,
        [overrideKey.trim()]: overrideBackend,
      },
    });
    setOverrideKey("");
  }, [applyTopology, topology, overrideKey, overrideBackend]);

  const handleClearOverride = useCallback(
    (key: string) => {
      if (!topology) {
        return;
      }
      const overrides = { ...topology.overrides };
      delete overrides[key];
      applyTopology({ ...topology, overrides });
    },
    [applyTopology, topology],
  );

  const handleSetRequirement = useCallback(() => {
    if (!topology || reqKey.trim() === "") {
      return;
    }
    applyTopology({
      ...topology,
      requirements: { ...topology.requirements, [reqKey.trim()]: { ...req } },
    });
    setReqKey("");
  }, [applyTopology, topology, reqKey, req]);

  const handleClearRequirement = useCallback(
    (key: string) => {
      if (!topology) {
        return;
      }
      const requirements = { ...topology.requirements };
      delete requirements[key];
      applyTopology({ ...topology, requirements });
    },
    [applyTopology, topology],
  );

  const handleCreateDrive = useCallback(async () => {
    if (!client || !topology || driveName.trim() === "") {
      return;
    }
    setOpError("");
    const name = driveName.trim();
    try {
      if (driveTarget === "") {
        const drive = await client.drives.create({ global: { name } });
        const owner = client
          .describeRouting()
          .documents.find((entry) => entry.identifier === drive.header.id);
        setCreateResult(
          `router placed drive ${drive.header.id} on ${owner?.backend ?? "(unresolved)"}`,
        );
      } else {
        const target = topology.reactors.find((r) => r.name === driveTarget);
        if (!target) {
          return;
        }
        const drive = await target.client.drives.create({ global: { name } });
        setCreateResult(
          `created drive ${drive.header.id} directly on ${driveTarget}; the router learns its owner on the next operation`,
        );
      }
      setDriveName("");
      refresh(client);
    } catch (error) {
      setCreateResult("");
      setOpError(error instanceof Error ? error.message : String(error));
    }
  }, [client, topology, driveName, driveTarget, refresh]);

  const handleFind = useCallback(async () => {
    if (!client || !topology) {
      return;
    }
    setOpError("");
    try {
      const page = await client.find({ type: findType.trim() });
      // Provenance: ask each backend which one actually holds each hit. This
      // is what the router's own servingBackends does; done here only to label
      // a merged list that carries no backend of its own.
      const hits = await Promise.all(
        page.results.map(async (document): Promise<FindHit> => {
          const owners = await Promise.all(
            topology.reactors.map(async (reactor) => ({
              name: reactor.name,
              serves: await reactor.client
                .isServed(document.header.id)
                .catch(() => false),
            })),
          );
          return {
            id: document.header.id,
            name: document.header.name,
            type: document.header.documentType,
            backend: owners.find((owner) => owner.serves)?.name ?? "(none)",
          };
        }),
      );
      setFindHits(hits);
      refresh(client);
    } catch (error) {
      setFindHits(null);
      setOpError(error instanceof Error ? error.message : String(error));
    }
  }, [client, topology, findType, refresh]);

  const handleBatch = useCallback(async () => {
    if (!client || batchA.trim() === "" || batchB.trim() === "") {
      return;
    }
    setBatchError(null);
    const plan = (documentId: string) => ({
      key: documentId,
      documentId,
      scope: "global",
      branch: "main",
      actions: [],
      dependsOn: [],
    });
    const request: BatchExecutionRequest = {
      jobs: [plan(batchA.trim()), plan(batchB.trim())],
    };
    try {
      await client.executeBatch(request);
      setBatchError({
        name: "accepted",
        message:
          "the batch's documents share one backend, so it was not refused",
      });
    } catch (error) {
      setBatchError({
        name: error instanceof Error ? error.name : "Error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
    refresh(client);
  }, [client, batchA, batchB, refresh]);

  const handleRelationship = useCallback(async () => {
    if (!client || batchA.trim() === "" || batchB.trim() === "") {
      return;
    }
    setRelError(null);
    try {
      await client.addRelationship(batchA.trim(), batchB.trim(), "child");
      setRelError({
        name: "accepted",
        message:
          "source and target share one backend, so the write was not refused",
      });
    } catch (error) {
      setRelError({
        name: error instanceof Error ? error.name : "Error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, [client, batchA, batchB]);

  const backendNames = topology?.reactors.map((reactor) => reactor.name) ?? [];
  const requirementRows = Object.entries(topology?.requirements ?? {});

  return (
    <section className="rm-tab" aria-label="Router topology">
      <h2>Router topology</h2>
      <p className="rm-note">
        Build one routing client over two or more ready reactors. Placement is
        keyed on the drive/collection id; routing is advisory, so a write aimed
        at the wrong backend is refused, re-aimed, and the table corrected
        (multi-reactor decision 4). Overrides and requirements reconfigure the
        topology, which rebuilds the client over the same backends.
      </p>

      <div className="rm-router-build">
        <h3>Backends</h3>
        {ready.length < 2 ? (
          <p className="rm-placeholder" data-testid="router-needs-reactors">
            Provision at least two ready reactors to route over them.
          </p>
        ) : (
          <ul className="rm-router-select">
            {ready.map((reactor) => (
              <li key={reactor.name}>
                <label>
                  <input
                    checked={selected.has(reactor.name)}
                    data-testid={`router-backend-option-${reactor.name}`}
                    onChange={() => toggle(reactor.name)}
                    type="checkbox"
                  />
                  {reactor.name} <span className="rm-note">{reactor.kind}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <button
          className="rm-btn"
          data-testid="router-build"
          disabled={selected.size < 2}
          onClick={handleBuild}
          type="button"
        >
          {client ? "Rebuild router" : "Build router"}
        </button>
        {buildError ? <p className="rm-error">{buildError}</p> : null}
      </div>

      {client && snapshot ? (
        <>
          <h3>
            Routing over {backendNames.length} backends (primary:{" "}
            {backendNames[0]})
          </h3>
          <ul className="rm-router-backends" data-testid="router-backends">
            {(topology?.reactors ?? []).map((reactor, index) => (
              <li
                className="rm-router-backend"
                data-testid={`router-backend-${reactor.name}`}
                key={reactor.name}
              >
                <div className="rm-router-backend-head">
                  <strong>{reactor.name}</strong>
                  <span className="rm-note">{reactor.kind}</span>
                  {index === 0 ? (
                    <span className="rm-badge rm-badge-neutral">primary</span>
                  ) : null}
                </div>
                <CapabilitySummary reactor={reactor} />
              </li>
            ))}
          </ul>

          <h3>Routing table (describeRouting)</h3>
          <div className="rm-table-wrap">
            <table className="rm-table" data-testid="router-table">
              <thead>
                <tr>
                  <th>Collection</th>
                  <th>Backend</th>
                  <th>Evidence</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {snapshot.collections.length === 0 ? (
                  <tr>
                    <td className="rm-table-empty" colSpan={4}>
                      No collection routed yet. Create a drive, run an
                      operation, or set an override to populate the table.
                    </td>
                  </tr>
                ) : (
                  snapshot.collections.map((entry) => (
                    <tr
                      data-testid={`router-route-${entry.collectionId}`}
                      key={entry.collectionId}
                    >
                      <td title={entry.collectionId}>{entry.collectionId}</td>
                      <td>{entry.backend}</td>
                      <td>
                        <SourceBadge source={entry.source} />
                      </td>
                      <td>
                        {topology &&
                        entry.collectionId in topology.overrides ? (
                          <button
                            className="rm-btn rm-btn-small"
                            onClick={() =>
                              handleClearOverride(entry.collectionId)
                            }
                            type="button"
                          >
                            Clear override
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {snapshot.documents.length > 0 ? (
            <details>
              <summary>
                Resolved documents ({snapshot.documents.length})
              </summary>
              <div className="rm-table-wrap">
                <table className="rm-table" data-testid="router-documents">
                  <tbody>
                    {snapshot.documents.map((entry) => (
                      <tr key={entry.identifier}>
                        <td title={entry.identifier}>{entry.identifier}</td>
                        <td>{entry.backend}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ) : null}

          <h3>Overrides</h3>
          <div className="rm-form rm-form-inline">
            <label>
              Drive id or collection key
              <input
                data-testid="router-override-key"
                onChange={(e) => setOverrideKey(e.target.value)}
                placeholder="drive id"
                type="text"
                value={overrideKey}
              />
            </label>
            <label>
              Backend
              <select
                data-testid="router-override-backend"
                onChange={(e) => setOverrideBackend(e.target.value)}
                value={overrideBackend}
              >
                <option value="">select a backend</option>
                {backendNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="rm-btn"
              data-testid="router-override-set"
              disabled={overrideKey.trim() === "" || overrideBackend === ""}
              onClick={handleSetOverride}
              type="button"
            >
              Set override
            </button>
          </div>

          <h3>Capability requirements</h3>
          <p className="rm-note">
            Filter placement candidates before the hash: a collection that
            requires the workflow engine cannot be placed on a browser backend
            that cannot run it.
          </p>
          <div className="rm-form rm-form-inline">
            <label>
              Drive id or collection key
              <input
                data-testid="router-require-key"
                onChange={(e) => setReqKey(e.target.value)}
                placeholder="drive id"
                type="text"
                value={reqKey}
              />
            </label>
            <label>
              <input
                checked={req.workflows}
                data-testid="router-require-workflows"
                onChange={(e) =>
                  setReq((r) => ({ ...r, workflows: e.target.checked }))
                }
                type="checkbox"
              />
              workflows
            </label>
            <label>
              <input
                checked={req.durableStorage}
                onChange={(e) =>
                  setReq((r) => ({ ...r, durableStorage: e.target.checked }))
                }
                type="checkbox"
              />
              durable storage
            </label>
            <label>
              <input
                checked={req.inspectable}
                onChange={(e) =>
                  setReq((r) => ({ ...r, inspectable: e.target.checked }))
                }
                type="checkbox"
              />
              inspectable
            </label>
            <button
              className="rm-btn"
              data-testid="router-require-set"
              disabled={reqKey.trim() === ""}
              onClick={handleSetRequirement}
              type="button"
            >
              Set requirement
            </button>
          </div>
          {requirementRows.length > 0 ? (
            <ul
              className="rm-router-requirements"
              data-testid="router-requirements"
            >
              {requirementRows.map(([key, input]) => (
                <li key={key}>
                  <div className="rm-router-backend-head">
                    <strong title={key}>{key}</strong>
                    <button
                      className="rm-btn rm-btn-small"
                      onClick={() => handleClearRequirement(key)}
                      type="button"
                    >
                      Clear
                    </button>
                  </div>
                  <EligibilityNote
                    input={input}
                    reactors={topology?.reactors ?? []}
                  />
                </li>
              ))}
            </ul>
          ) : null}

          <h3>Create a drive</h3>
          <div className="rm-form rm-form-inline">
            <label>
              Drive name
              <input
                data-testid="router-create-drive-name"
                onChange={(e) => setDriveName(e.target.value)}
                placeholder="My drive"
                type="text"
                value={driveName}
              />
            </label>
            <label>
              Target
              <select
                data-testid="router-create-drive-target"
                onChange={(e) => setDriveTarget(e.target.value)}
                value={driveTarget}
              >
                <option value="">auto (router places)</option>
                {backendNames.map((name) => (
                  <option key={name} value={name}>
                    on {name}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="rm-btn"
              data-testid="router-create-drive"
              disabled={driveName.trim() === ""}
              onClick={() => void handleCreateDrive()}
              type="button"
            >
              Create drive
            </button>
          </div>
          {createResult ? (
            <p className="rm-note" data-testid="router-create-result">
              {createResult}
            </p>
          ) : null}

          <h3>Find across all backends</h3>
          <div className="rm-form rm-form-inline">
            <label>
              Document type
              <input
                data-testid="router-find-type"
                onChange={(e) => setFindType(e.target.value)}
                type="text"
                value={findType}
              />
            </label>
            <button
              className="rm-btn"
              data-testid="router-find"
              onClick={() => void handleFind()}
              type="button"
            >
              Find across all
            </button>
          </div>
          {findHits ? (
            <div className="rm-table-wrap">
              <table className="rm-table" data-testid="router-find-results">
                <thead>
                  <tr>
                    <th>Document</th>
                    <th>Name</th>
                    <th>Answered by</th>
                  </tr>
                </thead>
                <tbody>
                  {findHits.length === 0 ? (
                    <tr>
                      <td className="rm-table-empty" colSpan={3}>
                        No documents matched across any backend.
                      </td>
                    </tr>
                  ) : (
                    findHits.map((hit) => (
                      <tr
                        data-testid={`router-find-hit-${hit.id}`}
                        key={hit.id}
                      >
                        <td title={hit.id}>{hit.id}</td>
                        <td>{hit.name}</td>
                        <td>{hit.backend}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ) : null}

          <h3>v1 constraints</h3>
          <p className="rm-note">
            A batch never spans reactors, and a relationship WRITE never does
            either. Give two document ids that live on different backends and
            the router refuses by name rather than half-applying.
          </p>
          <div className="rm-form rm-form-inline">
            <label>
              Document A
              <input
                data-testid="router-constraint-a"
                onChange={(e) => setBatchA(e.target.value)}
                placeholder="document id"
                type="text"
                value={batchA}
              />
            </label>
            <label>
              Document B
              <input
                data-testid="router-constraint-b"
                onChange={(e) => setBatchB(e.target.value)}
                placeholder="document id"
                type="text"
                value={batchB}
              />
            </label>
            <button
              className="rm-btn"
              data-testid="router-batch"
              disabled={batchA.trim() === "" || batchB.trim() === ""}
              onClick={() => void handleBatch()}
              type="button"
            >
              Cross-backend batch
            </button>
            <button
              className="rm-btn"
              data-testid="router-relationship"
              disabled={batchA.trim() === "" || batchB.trim() === ""}
              onClick={() => void handleRelationship()}
              type="button"
            >
              Cross-backend relationship
            </button>
          </div>
          {batchError ? (
            <p
              className={
                batchError.name === "accepted" ? "rm-note" : "rm-error"
              }
              data-testid="router-batch-error"
              role="alert"
            >
              <strong>{batchError.name}</strong>: {batchError.message}
            </p>
          ) : null}
          {relError ? (
            <p
              className={relError.name === "accepted" ? "rm-note" : "rm-error"}
              data-testid="router-relationship-error"
              role="alert"
            >
              <strong>{relError.name}</strong>: {relError.message}
            </p>
          ) : null}

          {opError ? (
            <p className="rm-error" data-testid="router-op-error" role="alert">
              {opError}
            </p>
          ) : null}

          <h3>Diagnostics</h3>
          <p className="rm-note">
            The router&apos;s onDiagnostic stream: stale overrides, resolved
            misroutes, tolerant fan-in losses.
          </p>
          {log.length === 0 ? (
            <p className="rm-placeholder" data-testid="router-log-empty">
              No diagnostics yet.
            </p>
          ) : (
            <ul className="rm-event-feed" data-testid="router-log">
              {log.map((line) => (
                <li key={line.id}>{line.text}</li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </section>
  );
}

/**
 * Which backends can hold a collection with this requirement, and why the rest
 * cannot -- read straight off the capability contract with the router's own
 * `eligibleBackends` / `ineligibleReason`, so the panel agrees with placement
 * by construction.
 */
function EligibilityNote({
  input,
  reactors,
}: {
  readonly input: CollectionRequirementsInput;
  readonly reactors: readonly ManagedReactor[];
}) {
  const requirements = collectionRequirements(input);
  const backends: readonly ReactorBackend[] = reactors.map((reactor) => ({
    name: reactor.name,
    capabilities: reactor.capabilities,
    client: reactor.client,
  }));
  const eligible = eligibleBackends(backends, requirements);
  const eligibleNames = eligible.map((backend) => backend.name);
  const ineligible = backends.filter(
    (backend) => !eligibleNames.includes(backend.name),
  );
  return (
    <div className="rm-note" data-testid="router-eligibility">
      {eligibleNames.length === 0 ? (
        <span className="rm-warning-inline">
          No eligible backend: placement would refuse this collection.
        </span>
      ) : (
        <span>Eligible: {eligibleNames.join(", ")}</span>
      )}
      {ineligible.length > 0 ? (
        <ul>
          {ineligible.map((backend) => (
            <li key={backend.name}>
              {backend.name}:{" "}
              {ineligibleReason(backend.capabilities, requirements)}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export default RoutingPanel;
