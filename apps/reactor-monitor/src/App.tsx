/**
 * Reactor Monitor app shell (W0.4 of the multi-reactor initiative — see
 * docs/plans/2026-10-03-multi-reactor.md). A sidebar provisions and lists
 * reactors from `@powerhousedao/reactor-monitor`; the main panel hosts the
 * inspector tabs, wired to the selected reactor's `IInspector`, `dbQuery`,
 * `syncManager` and `events`.
 */
import {
  ReactorMonitorProvider,
  useManagedReactorEntry,
  useManagedReactors,
  useReactorMonitorRegistry,
} from "@powerhousedao/reactor-monitor/react";
import {
  GQL_CHANNEL_TYPE,
  supportsSyncChannel,
  type ManagedReactor,
  type ManagedReactorEntry,
  type ReactorDescriptor,
} from "@powerhousedao/reactor-monitor";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useServerTierGates } from "./components/AdminGate.js";
import { LinkLocalSyncPanel } from "./components/LinkLocalSyncPanel.js";
import { MonitoringSetsPanel } from "./components/MonitoringSetsPanel.js";
import {
  ProvisionPanel,
  type ProvisionRequest,
} from "./components/ProvisionPanel.js";
import { RoutingPanel } from "./components/RoutingPanel.js";
import { MonitoringSetsStore } from "./monitoring-sets.js";
import {
  buildDescriptor as buildDescriptorFromForm,
  createMonitorWorker,
} from "./provisioning.js";
import { AttachmentsTab } from "./tabs/AttachmentsTab.js";
import { CatchUpTab } from "./tabs/CatchUpTab.js";
import { DbTab } from "./tabs/DbTab.js";
import { EventsTab } from "./tabs/EventsTab.js";
import { IntegrityTab } from "./tabs/IntegrityTab.js";
import { ModulesTab } from "./tabs/ModulesTab.js";
import { OverviewTab } from "./tabs/OverviewTab.js";
import { ProcessorsTab } from "./tabs/ProcessorsTab.js";
import { QueueTab } from "./tabs/QueueTab.js";
import { SyncTab } from "./tabs/SyncTab.js";

export const INSPECTOR_TABS = [
  "Overview",
  "Modules",
  "Queue",
  "Processors",
  "Catch-up",
  "Integrity",
  "DB",
  "Sync",
  "Attachments",
  "Events",
] as const;

export type InspectorTab = (typeof INSPECTOR_TABS)[number];

/**
 * The two top-level surfaces. "Inspect" is the per-reactor tab strip; "Router"
 * is the reactor-SPANNING topology view, which does not belong on the per-
 * reactor strip because it is about the set of reactors, not any one of them
 * (multi-reactor router, stages 1-3).
 */
export const APP_VIEWS = ["Inspect", "Router"] as const;

export type AppView = (typeof APP_VIEWS)[number];

/**
 * The inspector panel for a READY reactor.
 *
 * Its own component, keyed per reactor by the caller, because the gates it
 * reads are not static: a remote reactor's admin tiers are its host's posture,
 * an operator changes them with a restart, and {@link useServerTierGates} keeps
 * this panel's reading of them current (multi-reactor W3.2 review).
 */
function ReadyPanel({
  reactor,
  tab,
}: {
  readonly reactor: ManagedReactor;
  readonly tab: InspectorTab;
}): ReactNode {
  // What this reactor serves beyond reads. Every locally hosted reactor serves
  // everything -- it is this process's own; a REMOTE one reports which tiers
  // its host opted into, and the levers are disabled with that reason rather
  // than offered and refused (multi-reactor W3.2).
  const { admin, sql, recheck, rechecking, recheckError } =
    useServerTierGates(reactor);
  switch (tab) {
    case "Overview":
      return (
        <OverviewTab
          onRecheckServer={recheck}
          recheckError={recheckError}
          rechecking={rechecking}
          reactor={reactor}
        />
      );
    case "Modules":
      return <ModulesTab inspector={reactor.inspector} />;
    case "Queue":
      return <QueueTab admin={admin} inspector={reactor.inspector} />;
    case "Processors":
      return <ProcessorsTab admin={admin} inspector={reactor.inspector} />;
    case "Catch-up":
      return <CatchUpTab admin={admin} inspector={reactor.inspector} />;
    case "Integrity":
      return <IntegrityTab admin={admin} inspector={reactor.inspector} />;
    case "DB":
      return <DbTab dbQuery={reactor.dbQuery} sql={sql} />;
    case "Attachments":
      // Reads the handle's own attachment surface rather than the inspector:
      // byte movement is a capability of the reactor this process BUILT, so a
      // reactor without a store says so instead of rendering empty counts
      // (multi-reactor W3.4).
      return <AttachmentsTab reactor={reactor} />;
    case "Sync":
      return (
        <>
          {/*
            Both panels gate on the capability contract, which is what a router
            reads too, and which carries the channel types the reactor actually
            routes -- a worker's `adoptLocalSyncPeer` presence alone can
            disagree with a descriptor when a later tab's loses the race to the
            construct that actually built (multi-reactor stage 2 review). Since
            W3.0 the channels are independent: a connect-mode reactor declares
            `gql` and `local`, a local-only reactor only `local`, a
            switchboard-scheme reactor `polling` and `local` (so no add-remote
            form, since a polling channel is created by the peer that polls
            this reactor), and an island none. The link panel reads its own end
            from the registry, so only the gql gate is passed in.
          */}
          {/*
            A remote reactor cannot be given a MessagePort, so the brokered
            link panel has nothing to offer it -- `syncChannels` never contains
            `local` for one, but the panel is also about THIS monitor's own
            reactors, so it is left out entirely rather than rendered inert.
          */}
          {reactor.kind === "remote" ? null : (
            <LinkLocalSyncPanel reactorName={reactor.name} />
          )}
          {/*
            The add-remote form gets the SAME rule the link panel just got, for
            the same reason: a remote reactor's remotes are not this monitor's
            to change. `RemoteSyncManagerClient.add()` refuses by name because
            which peers a Switchboard syncs with is that deployment's
            configuration, and the inspection subgraph does not serve it -- so a
            live form whose every submit is refused is a form that cannot work,
            whatever channel types that reactor reports routing (a CONNECT-scheme
            Switchboard reports `gql` and would have rendered one).
          */}
          <SyncTab
            admin={admin}
            gqlRemotes={supportsSyncChannel(
              reactor.capabilities,
              GQL_CHANNEL_TYPE,
            )}
            inspector={reactor.inspector}
            reconfigurable={reactor.kind !== "remote"}
            syncManager={reactor.syncManager}
          />
        </>
      );
    case "Events":
      // The remote inspection surface is request/response GraphQL: nothing
      // streams the far side's bus events, and `reactor.events` says so by
      // throwing. Say it here instead of letting the tab hit that.
      return reactor.kind === "remote" ? (
        <p className="rm-placeholder" data-testid="events-unavailable">
          A remote reactor&apos;s event bus is not forwarded over the inspection
          surface (request/response GraphQL, no stream). The inspection tabs
          poll instead.
        </p>
      ) : (
        <EventsTab events={reactor.events} />
      );
  }
}

/** The selected reactor's panel, or why there is none to show. */
function InspectorPanel({
  entry,
  tab,
}: {
  readonly entry: ManagedReactorEntry | undefined;
  readonly tab: InspectorTab;
}): ReactNode {
  if (!entry) {
    return (
      <p className="reactor-monitor__placeholder">
        Select a reactor to inspect it.
      </p>
    );
  }
  if (entry.status === "provisioning") {
    return (
      <p className="reactor-monitor__placeholder">
        Provisioning {entry.name}...
      </p>
    );
  }
  if (entry.status === "failed") {
    return (
      <p className="rm-error">
        Failed to provision {entry.name}: {entry.error.message}
      </p>
    );
  }
  // Keyed per reactor, so the panel's tier-polling state belongs to the handle
  // it was read from rather than surviving a switch to another reactor.
  return <ReadyPanel key={entry.name} reactor={entry.reactor} tab={tab} />;
}

type AppBodyProps = {
  readonly selected: string | undefined;
  readonly onSelect: (name: string) => void;
  readonly onProvision: (request: ProvisionRequest) => void;
  readonly onKill: (name: string) => void;
  readonly setNames: readonly string[];
  readonly activeSetName: string;
  readonly onSwitchSet: (name: string) => void;
  readonly onCreateSet: (name: string) => void;
  readonly onDeleteSet: (name: string) => void;
};

function AppBody({
  selected,
  onSelect,
  onProvision,
  onKill,
  setNames,
  activeSetName,
  onSwitchSet,
  onCreateSet,
  onDeleteSet,
}: AppBodyProps) {
  const entries = useManagedReactors();
  const entry = useManagedReactorEntry(selected ?? "");
  const [activeTab, setActiveTab] = useState<InspectorTab>("Overview");
  const [view, setView] = useState<AppView>("Inspect");
  const registry = useReactorMonitorRegistry();

  /**
   * Dev-only scripting handle: exposes the live registry on the window so
   * operator tooling (live verification passes, demo scripts) can provision,
   * link, and drive reactors programmatically. The Router view augments this
   * same object with `.router` (the built routing client) and
   * `.routerDescribe()` — see RoutingPanel. Never set in production builds.
   */
  useEffect(() => {
    const env = (import.meta as unknown as { env?: { DEV?: boolean } }).env;
    if (env?.DEV) {
      (
        window as unknown as { __reactorMonitor?: typeof registry }
      ).__reactorMonitor = registry;
    }
  }, [registry]);

  return (
    <div className="reactor-monitor__body">
      <div className="reactor-monitor__sidebar-column">
        <MonitoringSetsPanel
          activeSetName={activeSetName}
          onCreate={onCreateSet}
          onDelete={onDeleteSet}
          onSwitch={onSwitchSet}
          setNames={setNames}
        />
        <ProvisionPanel
          entries={entries}
          onKill={onKill}
          onProvision={onProvision}
          onSelect={onSelect}
          selected={selected}
        />
      </div>
      <main className="reactor-monitor__main">
        <nav aria-label="Views" className="reactor-monitor__tabs">
          {APP_VIEWS.map((name) => (
            <button
              className={
                name === view
                  ? "reactor-monitor__tab reactor-monitor__tab-active"
                  : "reactor-monitor__tab"
              }
              key={name}
              onClick={() => setView(name)}
              type="button"
            >
              {name}
            </button>
          ))}
        </nav>
        {view === "Inspect" ? (
          <>
            <nav
              aria-label="Inspector panels"
              className="reactor-monitor__tabs"
            >
              {INSPECTOR_TABS.map((tab) => (
                <button
                  className={
                    tab === activeTab
                      ? "reactor-monitor__tab reactor-monitor__tab-active"
                      : "reactor-monitor__tab"
                  }
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  type="button"
                >
                  {tab}
                </button>
              ))}
            </nav>
            <div className="reactor-monitor__panel">
              <InspectorPanel entry={entry} tab={activeTab} />
            </div>
          </>
        ) : (
          <div className="reactor-monitor__panel">
            <RoutingPanel />
          </div>
        )}
      </main>
    </div>
  );
}

/**
 * Re-attaches the live handles a persisted descriptor cannot carry. A worker
 * descriptor's `createWorker` is a function, so it is dropped on save and must
 * be restored from the app's own SharedWorker seam before the descriptor can
 * provision again after a reload. Every other kind round-trips as-is.
 */
function rehydrateDescriptor(descriptor: ReactorDescriptor): ReactorDescriptor {
  if (descriptor.kind === "worker") {
    return { ...descriptor, createWorker: createMonitorWorker };
  }
  return descriptor;
}

export type AppProps = {
  /**
   * Builds the descriptor the provision form submits. Defaults to the real
   * one (worker reactors get the app's SharedWorker seam; in-process
   * reactors default to `idb://` storage so they survive a reload).
   * Overridable so a test can force `storage: { kind: "memory" }` — a
   * worker/an `idb://` store needs a browser, not happy-dom.
   */
  readonly buildDescriptor?: (request: ProvisionRequest) => ReactorDescriptor;
  /**
   * The monitoring-sets store that persists provisioned reactors across a
   * refresh (multi-reactor §6). Defaults to a localStorage-backed one;
   * overridable so a test can inject a fresh, isolated store.
   */
  readonly store?: MonitoringSetsStore;
};

export function App({
  buildDescriptor = buildDescriptorFromForm,
  store: injectedStore,
}: AppProps = {}) {
  const [store] = useState(() => injectedStore ?? new MonitoringSetsStore());
  const [setNames, setSetNames] = useState<readonly string[]>(() =>
    store.listSetNames(),
  );
  const [activeSetName, setActiveSetName] = useState(() =>
    store.getActiveSetName(),
  );
  const [descriptors, setDescriptors] = useState<ReactorDescriptor[]>(() =>
    store.getActiveDescriptors().map(rehydrateDescriptor),
  );
  const [selected, setSelected] = useState<string | undefined>();

  const handleProvision = useCallback(
    (request: ProvisionRequest) => {
      const built = buildDescriptor(request);
      setDescriptors((previous) => {
        const next = [...previous, built];
        store.setActiveDescriptors(next);
        return next;
      });
      setSelected(request.name);
    },
    [buildDescriptor, store],
  );

  const handleKill = useCallback(
    (name: string) => {
      setDescriptors((previous) => {
        const next = previous.filter((d) => d.name !== name);
        store.setActiveDescriptors(next);
        return next;
      });
      setSelected((current) => (current === name ? undefined : current));
    },
    [store],
  );

  const handleSwitchSet = useCallback(
    (name: string) => {
      setDescriptors(store.switchActiveSet(name).map(rehydrateDescriptor));
      setActiveSetName(store.getActiveSetName());
      setSelected(undefined);
    },
    [store],
  );

  const handleCreateSet = useCallback(
    (name: string) => {
      setDescriptors(store.createSet(name).map(rehydrateDescriptor));
      setSetNames(store.listSetNames());
      setActiveSetName(store.getActiveSetName());
      setSelected(undefined);
    },
    [store],
  );

  const handleDeleteSet = useCallback(
    (name: string) => {
      setDescriptors(store.deleteSet(name).map(rehydrateDescriptor));
      setSetNames(store.listSetNames());
      setActiveSetName(store.getActiveSetName());
      setSelected(undefined);
    },
    [store],
  );

  return (
    <div className="reactor-monitor">
      <header className="reactor-monitor__header">
        <h1>Reactor Monitor</h1>
      </header>
      <ReactorMonitorProvider
        descriptors={descriptors}
        onError={(error, descriptor) =>
          console.error(
            `[reactor-monitor] failed to provision "${descriptor.name}":`,
            error,
          )
        }
      >
        <AppBody
          activeSetName={activeSetName}
          onCreateSet={handleCreateSet}
          onDeleteSet={handleDeleteSet}
          onKill={handleKill}
          onProvision={handleProvision}
          onSelect={setSelected}
          onSwitchSet={handleSwitchSet}
          selected={selected}
          setNames={setNames}
        />
      </ReactorMonitorProvider>
    </div>
  );
}

export default App;
