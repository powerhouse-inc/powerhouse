// The Router view: one routing client over chosen reactors, local or remote.
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
  type RouterBackend,
  type RouterTableEntry,
  type RouterTableSnapshot,
  type RouteSource,
  type RoutingClientOptions,
  type RoutingReactorClient,
} from "@powerhousedao/reactor-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  browserPlacementStorage,
  judgeLayer,
  loadPlacements,
  savePlacements,
  type PlacementLayer,
  type PlacementStorage,
} from "../lib/placements.js";
import type {
  RouteSeed,
  SaveVerdict,
  SeedRouterOptions,
} from "../lib/route-seed.js";
import { buildRoutingClient, type BuiltRouter } from "../lib/router.js";
import { capabilityCells } from "../tabs/OverviewTab.js";

export const ROUTER_COPY = {
  needsTwo: "Select at least two ready reactors to route over.",
  waiting: (names: string) => `Waiting for ${names} to be ready.`,
  routing: (app: string) => `Routing ${app}'s reactors.`,
  movedFrom: (configured: string) => `Moved here. Host config: ${configured}`,
  movedUnplaced: "Moved here. The host config doesn't place it.",
  reset: "Reset to config",
  undoMove: "Undo move",
  saveToHost: "Save to host config",
  saved: "Saved to the builder's draft. Review it in Build host.",
  notKept: "This browser won't keep the move after a reload.",
  dropped: (count: number) =>
    count === 1
      ? "The host config changed for 1 moved drive, so its move was dropped."
      : `The host config changed for ${count} moved drives, so their moves were dropped.`,
  inHostConfig: (backend: string) => `${backend} in the host config`,
  fromHostConfig: "From the host config",
} as const;

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
  /** The started app this router was opened for. */
  readonly seed?: RouteSeed;
  /** Placements from the host config; moves are the runtime layer. */
  readonly overrides: Readonly<Record<string, string>>;
  readonly requirements: Readonly<Record<string, CollectionRequirementsInput>>;
};

/** Collection requirements the panel can toggle. */
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

const DEV = ((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV ??
  false) as boolean;

/**
 * Publishes the built client on `window.__reactorMonitor.router` (dev only),
 * beside the registry handle the app already exposes, so a live pass can script
 * the router: `window.__reactorMonitor.router.describeRouting()`,
 * `.find(...)`, and so on. Never set in production builds.
 */
function exposeRouter(client: RoutingReactorClient | null): void {
  if (!DEV || typeof window === "undefined") {
    return;
  }
  const win = window as unknown as {
    __reactorMonitor?: Record<string, unknown>;
  };
  win.__reactorMonitor = win.__reactorMonitor ?? {};
  win.__reactorMonitor.router = client ?? undefined;
  win.__reactorMonitor.routerDescribe = client
    ? () => client.describeRouting()
    : undefined;
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
      {capabilityCells(reactor.reach, reactor.info).map((cell) => (
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

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** A moved row's line, or nothing when it is where the config puts it. */
function driftOf(
  entry: RouterTableEntry,
  label: (reactor: string) => string,
): string | undefined {
  if (entry.origin !== "runtime") return undefined;
  if (entry.configured === undefined) return ROUTER_COPY.movedUnplaced;
  return entry.configured === entry.backend
    ? undefined
    : ROUTER_COPY.movedFrom(label(entry.configured));
}

/** How moves are kept: a started app's by host backend and drive slug. */
type LayerNames = {
  readonly app?: string;
  readonly backend: (reactor: string) => string;
  readonly reactor: (stored: string) => string | undefined;
  readonly key: (routerKey: string) => string;
  readonly routerKey: (stored: string) => string;
};

function layerNames(seed: RouteSeed | undefined): LayerNames {
  if (!seed) {
    return {
      backend: (reactor) => reactor,
      reactor: (stored) => stored,
      key: (routerKey) => routerKey,
      routerKey: (stored) => stored,
    };
  }
  // A started copy's reactor names change with each start; these don't.
  const app = `${seed.source.host}/${seed.app}`;
  const prefix = `${app}/`;
  return {
    app,
    backend: (reactor) =>
      seed.backends.find((entry) => entry.reactor === reactor)?.backend ??
      reactor,
    reactor: (stored) =>
      seed.backends.find((entry) => entry.backend === stored)?.reactor,
    key: (routerKey) =>
      prefix +
      (Object.hasOwn(seed.drives, routerKey)
        ? seed.drives[routerKey]
        : routerKey),
    routerKey: (stored) => {
      const slug = stored.slice(prefix.length);
      return (
        Object.keys(seed.drives).find((key) => seed.drives[key] === slug) ??
        slug
      );
    },
  };
}

export type RoutingPanelProps = {
  /** The monitoring set whose moves this browser keeps. */
  readonly setName?: string;
  readonly storage?: PlacementStorage;
  /** Preselects a started Connect's reactors and its host config placements. */
  readonly seed?: RouteSeed;
  /** Adds a move to the builder's draft, or says why it can't. */
  readonly onSaveToHost?: (
    seed: RouteSeed,
    drive: string,
    backend: string,
  ) => SaveVerdict;
};

export function RoutingPanel({
  setName = "",
  storage: injectedStorage,
  seed,
  onSaveToHost,
}: RoutingPanelProps = {}) {
  const entries = useManagedReactors();
  const ready = useMemo(() => readyReactors(entries), [entries]);
  const [storage] = useState(
    () => injectedStorage ?? browserPlacementStorage(),
  );

  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [built, setBuilt] = useState<BuiltRouter | null>(null);
  const client = built?.client ?? null;
  const [topology, setTopology] = useState<Topology | null>(null);
  const [snapshot, setSnapshot] = useState<RouterTableSnapshot | null>(null);
  const [log, setLog] = useState<readonly LogLine[]>([]);
  const [buildError, setBuildError] = useState("");
  const [placementNote, setPlacementNote] = useState("");
  const [saveNotes, setSaveNotes] = useState<Readonly<Record<string, string>>>(
    {},
  );
  const layer = useRef<{ set: string; layer: PlacementLayer } | undefined>(
    undefined,
  );
  const seeded = useRef<string | undefined>(undefined);

  // Control inputs.
  const [moveKey, setMoveKey] = useState("");
  const [moveBackend, setMoveBackend] = useState("");
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

  useEffect(() => {
    return () => exposeRouter(null);
  }, []);

  // A replaced or unmounted router stops listening and lets its backends go.
  useEffect(() => {
    if (!built) return;
    const off = built.client.onRoutingChange(() =>
      setSnapshot(built.client.describeRouting()),
    );
    return () => {
      off();
      built.dispose();
    };
  }, [built]);

  const refresh = useCallback((routing: RoutingReactorClient) => {
    setSnapshot(routing.describeRouting());
  }, []);

  const storedLayer = useCallback((): PlacementLayer => {
    if (layer.current?.set !== setName) {
      layer.current = {
        set: setName,
        layer: loadPlacements(storage, setName),
      };
    }
    return layer.current.layer;
  }, [setName, storage]);

  const keepLayer = useCallback(
    (next: PlacementLayer): boolean => {
      layer.current = { set: setName, layer: next };
      return savePlacements(storage, setName, next);
    },
    [setName, storage],
  );

  /** Builds the client; the moves kept for this set are applied over the config. */
  const applyTopology = useCallback(
    (next: Topology) => {
      if (next.reactors.length < 2) {
        setBuildError(ROUTER_COPY.needsTwo);
        return;
      }
      // defaultBackend is the plan's RoutingOptions name (RC1's router PR).
      const options: RoutingClientOptions & SeedRouterOptions = {
        collections: next.overrides,
        requirements: next.requirements,
        onDiagnostic: (message) => appendLog(message),
        ...next.seed?.router,
      };
      let router: BuiltRouter;
      try {
        router = buildRoutingClient(
          next.reactors,
          options,
          next.seed?.connections,
        );
      } catch (error) {
        setBuildError(errorText(error));
        return;
      }
      setBuildError("");
      const names = new Set(next.reactors.map((reactor) => reactor.name));
      const kept = layerNames(next.seed);
      const stored = storedLayer();
      const { apply, dropped } = judgeLayer(stored, {
        ...(kept.app === undefined ? {} : { app: kept.app }),
        config: Object.fromEntries(
          Object.entries(next.overrides).map(([key, reactor]) => [
            kept.key(key),
            kept.backend(reactor),
          ]),
        ),
        backends: new Set([...names].map(kept.backend)),
      });
      let note = "";
      if (dropped.length > 0) {
        const left = { ...stored };
        for (const key of dropped) delete left[key];
        note = keepLayer(left)
          ? ROUTER_COPY.dropped(dropped.length)
          : ROUTER_COPY.notKept;
      }
      for (const [stored, entry] of apply) {
        const reactor = kept.reactor(entry.backend);
        if (reactor === undefined) continue;
        const key = kept.routerKey(stored);
        try {
          router.client.setPlacement(key, reactor);
        } catch (error) {
          appendLog(
            `A kept move for ${key} was not applied: ${errorText(error)}`,
          );
        }
      }
      setPlacementNote(note);
      setSaveNotes({});
      setSelected(new Set(names));
      setBuilt(router);
      setTopology(next);
      refresh(router.client);
      exposeRouter(router.client);
    },
    [appendLog, refresh, storedLayer, keepLayer],
  );

  // "Route this app's reactors": build once the seed's reactors are ready.
  const seedMissing = seed
    ? seed.backends
        .filter(({ reactor }) => !ready.some((r) => r.name === reactor))
        .map(({ reactor }) => reactor)
    : [];
  useEffect(() => {
    if (!seed || seeded.current === seed.id) return;
    const chosen = seed.backends.flatMap(({ reactor }) =>
      ready.filter((candidate) => candidate.name === reactor),
    );
    if (chosen.length !== seed.backends.length) return;
    seeded.current = seed.id;
    // The registry, not React, says when the seed's reactors are ready.
    // eslint-disable-next-line react-hooks-extra/set-state-in-effect
    applyTopology({
      reactors: chosen,
      seed,
      overrides: seed.collections,
      requirements: {},
    });
  }, [seed, ready, applyTopology]);

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

  /** A runtime placement; moving to the config's backend removes it. */
  const placeAt = useCallback(
    (key: string, backend: string | undefined) => {
      if (!client || !topology) return;
      const configured = Object.hasOwn(topology.overrides, key)
        ? topology.overrides[key]
        : undefined;
      const runtime = backend === configured ? undefined : backend;
      setOpError("");
      try {
        client.setPlacement(key, runtime);
      } catch (error) {
        setOpError(errorText(error));
        return;
      }
      const names = layerNames(topology.seed);
      const stored = names.key(key);
      const next = { ...storedLayer() };
      if (runtime === undefined) {
        delete next[stored];
      } else {
        next[stored] = {
          backend: names.backend(runtime),
          ...(configured === undefined
            ? {}
            : { configWas: names.backend(configured) }),
          ...(names.app === undefined ? {} : { app: names.app }),
        };
      }
      setPlacementNote(keepLayer(next) ? "" : ROUTER_COPY.notKept);
      setSaveNotes(({ [key]: _gone, ...rest }) => rest);
      refresh(client);
    },
    [client, topology, storedLayer, keepLayer, refresh],
  );

  const handleMove = useCallback(() => {
    if (moveKey.trim() === "" || moveBackend === "") return;
    placeAt(moveKey.trim(), moveBackend);
    setMoveKey("");
  }, [placeAt, moveKey, moveBackend]);

  const handleSave = useCallback(
    (entry: RouterTableEntry) => {
      const routed = topology?.seed;
      if (!routed || !onSaveToHost) return;
      const drive = Object.hasOwn(routed.drives, entry.collectionId)
        ? routed.drives[entry.collectionId]
        : undefined;
      const backend = routed.backends.find(
        ({ reactor }) => reactor === entry.backend,
      )?.backend;
      if (drive === undefined || backend === undefined) return;
      const verdict = onSaveToHost(routed, drive, backend);
      setSaveNotes((notes) => ({
        ...notes,
        [entry.collectionId]: verdict.ok ? ROUTER_COPY.saved : verdict.reason,
      }));
    },
    [topology, onSaveToHost],
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
        const created = await client.write.drives.create({
          global: { name },
        });
        await created.readable;
        const owner = client
          .describeRouting()
          .documents.find((entry) => entry.identifier === created.documentId);
        setCreateResult(
          `router placed drive ${created.documentId} on ${owner?.backend ?? "(unresolved)"}`,
        );
      } else {
        const target = topology.reactors.find(
          (r) => r.name === driveTarget && r.kind !== "remote",
        );
        if (!target) {
          return;
        }
        const created = await target.client.write.drives.create({
          global: { name },
        });
        await created.readable;
        setCreateResult(
          `created drive ${created.documentId} directly on ${driveTarget}; the router learns its owner on the next operation`,
        );
      }
      setDriveName("");
      refresh(client);
    } catch (error) {
      setCreateResult("");
      setOpError(errorText(error));
    }
  }, [client, topology, driveName, driveTarget, refresh]);

  const handleFind = useCallback(async () => {
    if (!client) {
      return;
    }
    setOpError("");
    try {
      const page = await client.read.find({ type: findType.trim() });
      const hits = await Promise.all(
        page.results.map(async (document): Promise<FindHit> => ({
          id: document.header.id,
          name: document.header.name,
          type: document.header.documentType,
          backend: await client
            .locate(document.header.id)
            .catch(() => "(none)"),
        })),
      );
      setFindHits(hits);
      refresh(client);
    } catch (error) {
      setFindHits(null);
      setOpError(errorText(error));
    }
  }, [client, findType, refresh]);

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
      const batch = await client.write.executeBatch(request);
      await batch.readable;
      setBatchError({
        name: "accepted",
        message:
          "the batch's documents share one backend, so it was not refused",
      });
    } catch (error) {
      setBatchError({
        name: error instanceof Error ? error.name : "Error",
        message: errorText(error),
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
      const added = await client.write.addRelationship(
        batchA.trim(),
        batchB.trim(),
        "child",
      );
      await added.readable;
      setRelError({
        name: "accepted",
        message:
          "source and target share one backend, so the write was not refused",
      });
    } catch (error) {
      setRelError({
        name: error instanceof Error ? error.name : "Error",
        message: errorText(error),
      });
    }
  }, [client, batchA, batchB]);

  const backendNames = topology?.reactors.map((reactor) => reactor.name) ?? [];
  const localNames =
    topology?.reactors
      .filter((reactor) => reactor.kind !== "remote")
      .map((reactor) => reactor.name) ?? [];
  const requirementRows = Object.entries(topology?.requirements ?? {});
  const hostBackendOf = (reactor: string) =>
    topology?.seed?.backends.find((entry) => entry.reactor === reactor)
      ?.backend;

  return (
    <section className="rm-tab rm-router" aria-label="Router topology">
      <h2>Router topology</h2>
      <p className="rm-note">
        Build one routing client over two or more ready reactors. Placement is
        keyed on the drive/collection id; routing is advisory, so a write aimed
        at the wrong backend is refused, re-aimed, and the table corrected.
        Moving a drive changes where this monitor routes it, and this browser
        keeps the move for the monitoring set.
      </p>

      {seed ? (
        <p className="rm-note" data-testid="router-seed">
          {seedMissing.length > 0
            ? ROUTER_COPY.waiting(seedMissing.join(", "))
            : ROUTER_COPY.routing(seed.app)}
        </p>
      ) : null}
      {seed && seed.settings.length > 0 ? (
        <div className="rm-router-host" data-testid="router-host-config">
          <h3>{ROUTER_COPY.fromHostConfig}</h3>
          <ul>
            {seed.settings.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}

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
            {(topology?.reactors ?? []).map((reactor, index) => {
              const hostBackend = hostBackendOf(reactor.name);
              return (
                <li
                  className="rm-router-backend"
                  data-testid={`router-backend-${reactor.name}`}
                  key={reactor.name}
                >
                  <div className="rm-router-backend-head">
                    <strong>{reactor.name}</strong>
                    <span className="rm-note">{reactor.kind}</span>
                    {hostBackend ? (
                      <span className="rm-note">
                        {ROUTER_COPY.inHostConfig(hostBackend)}
                      </span>
                    ) : null}
                    {index === 0 ? (
                      <span className="rm-badge rm-badge-neutral">primary</span>
                    ) : null}
                  </div>
                  <CapabilitySummary reactor={reactor} />
                </li>
              );
            })}
          </ul>

          <h3>Routing table (describeRouting)</h3>
          {placementNote ? (
            <p className="rm-note" data-testid="router-placement-note">
              {placementNote}
            </p>
          ) : null}
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
                      operation, or move a drive to populate the table.
                    </td>
                  </tr>
                ) : (
                  snapshot.collections.map((entry) => {
                    const drive = topology?.seed?.drives[entry.collectionId];
                    const drift = driftOf(
                      entry,
                      (reactor) => hostBackendOf(reactor) ?? reactor,
                    );
                    const savable =
                      drift !== undefined &&
                      onSaveToHost !== undefined &&
                      drive !== undefined &&
                      hostBackendOf(entry.backend) !== undefined;
                    return (
                      <tr
                        data-testid={`router-route-${entry.collectionId}`}
                        key={entry.collectionId}
                      >
                        <td title={entry.collectionId}>
                          {drive ?? entry.collectionId}
                        </td>
                        <td>
                          <select
                            aria-label={`Move ${drive ?? entry.collectionId}`}
                            data-testid="router-route-backend"
                            onChange={(e) =>
                              placeAt(entry.collectionId, e.target.value)
                            }
                            value={entry.backend}
                          >
                            {backendNames.map((name) => (
                              <option key={name} value={name}>
                                {name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <SourceBadge source={entry.source} />
                        </td>
                        <td>
                          {drift ? (
                            <span
                              className="rm-note"
                              data-testid="router-route-drift"
                            >
                              {drift}
                            </span>
                          ) : null}
                          {entry.origin === "runtime" ? (
                            <button
                              className="rm-btn rm-btn-small"
                              onClick={() =>
                                placeAt(entry.collectionId, undefined)
                              }
                              type="button"
                            >
                              {entry.configured === undefined
                                ? ROUTER_COPY.undoMove
                                : ROUTER_COPY.reset}
                            </button>
                          ) : null}
                          {savable ? (
                            <button
                              className="rm-btn rm-btn-small"
                              onClick={() => handleSave(entry)}
                              type="button"
                            >
                              {ROUTER_COPY.saveToHost}
                            </button>
                          ) : null}
                          {saveNotes[entry.collectionId] ? (
                            <span
                              className="rm-note"
                              data-testid="router-route-saved"
                              role="status"
                            >
                              {saveNotes[entry.collectionId]}
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })
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

          <h3>Move a drive</h3>
          <div className="rm-form rm-form-inline">
            <label>
              Drive id or collection key
              <input
                data-testid="router-move-key"
                onChange={(e) => setMoveKey(e.target.value)}
                placeholder="drive id"
                type="text"
                value={moveKey}
              />
            </label>
            <label>
              Backend
              <select
                data-testid="router-move-backend"
                onChange={(e) => setMoveBackend(e.target.value)}
                value={moveBackend}
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
              data-testid="router-move"
              disabled={moveKey.trim() === "" || moveBackend === ""}
              onClick={handleMove}
              type="button"
            >
              Move
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
                  <EligibilityNote backends={client.backends} input={input} />
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
                {localNames.map((name) => (
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
 * cannot -- read off each backend's facts with the router's own
 * `eligibleBackends` / `ineligibleReason`, so the panel agrees with placement
 * by construction.
 */
function EligibilityNote({
  input,
  backends,
}: {
  readonly input: CollectionRequirementsInput;
  readonly backends: readonly RouterBackend[];
}) {
  const requirements = collectionRequirements(input);
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
              {backend.name}: {ineligibleReason(backend.facts, requirements)}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export default RoutingPanel;
