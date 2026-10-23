/**
 * Reactor Monitor app shell. A sidebar provisions and lists reactors from
 * `@powerhousedao/reactor-monitor`; the main panel hosts the inspector tabs for
 * the selected one.
 */
import {
  ReactorMonitorProvider,
  useManagedReactorEntry,
  useManagedReactors,
  useReactorMonitorRegistry,
} from "@powerhousedao/reactor-monitor/react";
import {
  GQL_CHANNEL_TYPE,
  type ManagedReactor,
  type ManagedReactorEntry,
  type ReactorDescriptor,
} from "@powerhousedao/reactor-monitor";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  adminGateFor,
  OperatorGateNote,
  operatorGateFor,
  sqlGateFor,
} from "./components/AdminGate.js";
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
  remoteHeaders,
  setRemoteBearer,
} from "./provisioning.js";
import { AttachmentsTab } from "./tabs/AttachmentsTab.js";
import { CatchUpTab } from "./tabs/CatchUpTab.js";
import { DbTab } from "./tabs/DbTab.js";
import { DrivesTab } from "./tabs/DrivesTab.js";
import { EventsTab } from "./tabs/EventsTab.js";
import { IntegrityTab } from "./tabs/IntegrityTab.js";
import { ModulesTab } from "./tabs/ModulesTab.js";
import { OverviewTab } from "./tabs/OverviewTab.js";
import { ProcessorsTab } from "./tabs/ProcessorsTab.js";
import { QueueTab } from "./tabs/QueueTab.js";
import { SyncTab } from "./tabs/SyncTab.js";
import { WorkflowsTab } from "./tabs/WorkflowsTab.js";

export const INSPECTOR_TABS = [
  "Overview",
  "Modules",
  "Drives",
  "Queue",
  "Processors",
  "Catch-up",
  "Integrity",
  "DB",
  "Sync",
  "Attachments",
  "Workflows",
  "Events",
] as const;

export type InspectorTab = (typeof INSPECTOR_TABS)[number];

/** "Inspect" is the per-reactor tab strip; "Router" spans the set of reactors. */
export const APP_VIEWS = ["Inspect", "Router"] as const;

export type AppView = (typeof APP_VIEWS)[number];

/** Re-reads a remote reactor's info; the panel re-renders its gates from it. */
function useInfoRecheck(reactor: ManagedReactor) {
  const [, setChecks] = useState(0);
  const [rechecking, setRechecking] = useState(false);
  const [recheckError, setRecheckError] = useState("");

  const recheck = useCallback(async () => {
    if (reactor.kind !== "remote") {
      return;
    }
    setRechecking(true);
    setRecheckError("");
    try {
      await reactor.refreshInfo();
    } catch (error) {
      setRecheckError(error instanceof Error ? error.message : String(error));
    }
    setRechecking(false);
    setChecks((count) => count + 1);
  }, [reactor]);

  return { recheck, rechecking, recheckError };
}

/** The inspector panel for a READY reactor, keyed per reactor by the caller. */
function ReadyPanel({
  reactor,
  tab,
}: {
  readonly reactor: ManagedReactor;
  readonly tab: InspectorTab;
}): ReactNode {
  const { recheck, rechecking, recheckError } = useInfoRecheck(reactor);
  const registry = useReactorMonitorRegistry();
  const admin = adminGateFor(reactor);
  const sql = sqlGateFor(reactor);
  const operator = operatorGateFor(reactor);
  const takeBearer =
    reactor.kind === "remote"
      ? async (bearer: string) => {
          setRemoteBearer(reactor.name, bearer);
          await recheck();
        }
      : undefined;
  const operational = (body: ReactNode): ReactNode =>
    operator.enabled ? (
      body
    ) : (
      <OperatorGateNote gate={operator} onBearer={takeBearer} />
    );

  switch (tab) {
    case "Overview":
      return (
        <OverviewTab
          onRecheckServer={
            reactor.kind === "remote" ? () => void recheck() : undefined
          }
          onRestartWorker={
            reactor.kind === "worker"
              ? () => registry.restart(reactor.name)
              : undefined
          }
          recheckError={recheckError}
          rechecking={rechecking}
          reactor={reactor}
        />
      );
    case "Modules":
      return <ModulesTab inspector={reactor.inspector} />;
    case "Drives":
      return (
        <DrivesTab
          drives={reactor.kind === "remote" ? undefined : reactor.client.drives}
          inspector={reactor.inspector}
          syncManager={reactor.syncManager}
        />
      );
    case "Queue":
      return operational(
        <QueueTab
          admin={admin}
          inspector={reactor.inspector}
          levers={reactor.admin}
        />,
      );
    case "Processors":
      return operational(
        <ProcessorsTab
          admin={admin}
          inspector={reactor.inspector}
          levers={reactor.admin}
        />,
      );
    case "Catch-up":
      return operational(
        <CatchUpTab
          admin={admin}
          inspector={reactor.inspector}
          levers={reactor.admin}
        />,
      );
    case "Integrity":
      return (
        <IntegrityTab
          admin={admin}
          inspector={reactor.inspector}
          levers={reactor.admin}
        />
      );
    case "DB":
      return <DbTab dbQuery={reactor.dbQuery} sql={sql} />;
    case "Attachments":
      return operational(<AttachmentsTab reactor={reactor} />);
    case "Workflows":
      return <WorkflowsTab reactor={reactor} />;
    case "Sync":
      // A remote reactor cannot be handed a MessagePort, and its remotes are
      // its host's configuration, so neither link panel nor add-remote is live.
      return operational(
        <>
          {reactor.kind === "remote" ? null : (
            <LinkLocalSyncPanel reactorName={reactor.name} />
          )}
          <SyncTab
            admin={admin}
            gqlRemotes={reactor.info.syncChannels.includes(GQL_CHANNEL_TYPE)}
            inspector={reactor.inspector}
            reconfigurable={reactor.kind !== "remote"}
            syncAdmin={reactor.syncAdmin}
            syncManager={reactor.syncManager}
          />
        </>,
      );
    case "Events":
      // Nothing streams a remote host's bus events over request/response GraphQL.
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
  // Keyed so re-check state belongs to one handle.
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
 * provision again after a reload. A remote's headers are dropped too (they
 * carry its bearer), so it gets back the reader a bearer pasted into its gate
 * note reaches. Every other kind round-trips as-is.
 */
function rehydrateDescriptor(descriptor: ReactorDescriptor): ReactorDescriptor {
  if (descriptor.kind === "worker") {
    return { ...descriptor, createWorker: createMonitorWorker };
  }
  if (descriptor.kind === "remote" && descriptor.remote) {
    const { name } = descriptor;
    return {
      ...descriptor,
      remote: { ...descriptor.remote, headers: () => remoteHeaders(name) },
    };
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
   * refresh. Defaults to a localStorage-backed one;
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
