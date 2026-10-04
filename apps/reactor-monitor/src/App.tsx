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
import { adminGateFor, sqlGateFor } from "./components/AdminGate.js";
import { LinkLocalSyncPanel } from "./components/LinkLocalSyncPanel.js";
import {
  ProvisionPanel,
  type ProvisionRequest,
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
  // What this reactor serves beyond reads. Every locally hosted reactor serves
  // everything -- it is this process's own; a REMOTE one reported which tiers
  // its host opted into, and the levers are disabled with that reason rather
  // than offered and refused (multi-reactor W3.2).
  const admin = adminGateFor(reactor);
  const sql = sqlGateFor(reactor);
  switch (tab) {
    case "Overview":
      return <OverviewTab reactor={reactor} />;
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
          <SyncTab
            admin={admin}
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

type AppBodyProps = {
  readonly selected: string | undefined;
  readonly onSelect: (name: string) => void;
  readonly onProvision: (request: ProvisionRequest) => void;
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
  readonly buildDescriptor?: (request: ProvisionRequest) => ReactorDescriptor;
};

export function App({
  buildDescriptor = buildDescriptorFromForm,
}: AppProps = {}) {
  const [descriptors, setDescriptors] = useState<ReactorDescriptor[]>([]);
  const [selected, setSelected] = useState<string | undefined>();

  const handleProvision = useCallback(
    (request: ProvisionRequest) => {
      setDescriptors((previous) => [...previous, buildDescriptor(request)]);
      setSelected(request.name);
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
