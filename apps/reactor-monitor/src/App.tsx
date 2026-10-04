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
  type ManagedReactorEntry,
  type ReactorDescriptor,
} from "@powerhousedao/reactor-monitor";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { LinkLocalSyncPanel } from "./components/LinkLocalSyncPanel.js";
import {
  ProvisionPanel,
  type ProvisionSyncMode,
} from "./components/ProvisionPanel.js";
import { buildDescriptor as buildDescriptorFromForm } from "./provisioning.js";
import { CatchUpTab } from "./tabs/CatchUpTab.js";
import { DbTab } from "./tabs/DbTab.js";
import { EventsTab } from "./tabs/EventsTab.js";
import { IntegrityTab } from "./tabs/IntegrityTab.js";
import { OverviewTab } from "./tabs/OverviewTab.js";
import { ProcessorsTab } from "./tabs/ProcessorsTab.js";
import { QueueTab } from "./tabs/QueueTab.js";
import { SyncTab } from "./tabs/SyncTab.js";

export const INSPECTOR_TABS = [
  "Overview",
  "Queue",
  "Processors",
  "Catch-up",
  "Integrity",
  "DB",
  "Sync",
  "Events",
] as const;

export type InspectorTab = (typeof INSPECTOR_TABS)[number];

function renderPanel(
  entry: ManagedReactorEntry | undefined,
  tab: InspectorTab,
): ReactNode {
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

  const reactor = entry.reactor;
  switch (tab) {
    case "Overview":
      return <OverviewTab reactor={reactor} />;
    case "Queue":
      return <QueueTab inspector={reactor.inspector} />;
    case "Processors":
      return <ProcessorsTab inspector={reactor.inspector} />;
    case "Catch-up":
      return <CatchUpTab inspector={reactor.inspector} />;
    case "Integrity":
      return <IntegrityTab inspector={reactor.inspector} />;
    case "DB":
      return <DbTab dbQuery={reactor.dbQuery} />;
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
          <LinkLocalSyncPanel reactorName={reactor.name} />
          <SyncTab
            gqlRemotes={supportsSyncChannel(
              reactor.capabilities,
              GQL_CHANNEL_TYPE,
            )}
            inspector={reactor.inspector}
            syncManager={reactor.syncManager}
          />
        </>
      );
    case "Events":
      return <EventsTab events={reactor.events} />;
  }
}

type AppBodyProps = {
  readonly selected: string | undefined;
  readonly onSelect: (name: string) => void;
  readonly onProvision: (
    name: string,
    kind: "worker" | "in-process",
    syncMode: ProvisionSyncMode,
  ) => void;
  readonly onKill: (name: string) => void;
};

function AppBody({ selected, onSelect, onProvision, onKill }: AppBodyProps) {
  const entries = useManagedReactors();
  const entry = useManagedReactorEntry(selected ?? "");
  const [activeTab, setActiveTab] = useState<InspectorTab>("Overview");
  const registry = useReactorMonitorRegistry();

  /**
   * Dev-only scripting handle: exposes the live registry on the window so
   * operator tooling (live verification passes, demo scripts) can provision,
   * link, and drive reactors programmatically. Never set in production builds.
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
      <ProvisionPanel
        entries={entries}
        onKill={onKill}
        onProvision={onProvision}
        onSelect={onSelect}
        selected={selected}
      />
      <main className="reactor-monitor__main">
        <nav aria-label="Inspector panels" className="reactor-monitor__tabs">
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
          {renderPanel(entry, activeTab)}
        </div>
      </main>
    </div>
  );
}

export type AppProps = {
  /**
   * Builds the descriptor the provision form submits. Defaults to the real
   * one (worker reactors get the app's SharedWorker seam; in-process
   * reactors default to `idb://` storage so they survive a reload).
   * Overridable so a test can force `storage: { kind: "memory" }` — a
   * worker/an `idb://` store needs a browser, not happy-dom.
   */
  readonly buildDescriptor?: (
    name: string,
    kind: "worker" | "in-process",
    syncMode: ProvisionSyncMode,
  ) => ReactorDescriptor;
};

export function App({
  buildDescriptor = buildDescriptorFromForm,
}: AppProps = {}) {
  const [descriptors, setDescriptors] = useState<ReactorDescriptor[]>([]);
  const [selected, setSelected] = useState<string | undefined>();

  const handleProvision = useCallback(
    (
      name: string,
      kind: "worker" | "in-process",
      syncMode: ProvisionSyncMode,
    ) => {
      setDescriptors((previous) => [
        ...previous,
        buildDescriptor(name, kind, syncMode),
      ]);
      setSelected(name);
    },
    [buildDescriptor],
  );

  const handleKill = useCallback((name: string) => {
    setDescriptors((previous) => previous.filter((d) => d.name !== name));
    setSelected((current) => (current === name ? undefined : current));
  }, []);

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
          onKill={handleKill}
          onProvision={handleProvision}
          onSelect={setSelected}
          selected={selected}
        />
      </ReactorMonitorProvider>
    </div>
  );
}

export default App;
