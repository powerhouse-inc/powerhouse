/**
 * Placeholder shell for the reactor-monitor app (W0.1 of the multi-reactor
 * initiative — see docs/plans/2026-10-03-multi-reactor.md). A sidebar lists
 * provisioned reactors; the main panel hosts the inspector tabs. Real
 * provisioning (W0.2) and the inspector UI port (W0.4) attach to this
 * layout later; for now every panel is a static placeholder.
 */

export const INSPECTOR_TABS = [
  "Overview",
  "Queue",
  "Processors",
  "Sync",
  "Events",
  "DB",
] as const;

export type InspectorTab = (typeof INSPECTOR_TABS)[number];

export function App() {
  return (
    <div className="reactor-monitor">
      <header className="reactor-monitor__header">
        <h1>Reactor Monitor</h1>
      </header>
      <div className="reactor-monitor__body">
        <aside className="reactor-monitor__sidebar" aria-label="Reactor list">
          <h2>Reactors</h2>
          <p className="reactor-monitor__placeholder">
            No reactors provisioned yet.
          </p>
        </aside>
        <main className="reactor-monitor__main">
          <nav className="reactor-monitor__tabs" aria-label="Inspector panels">
            {INSPECTOR_TABS.map((tab) => (
              <span key={tab} className="reactor-monitor__tab">
                {tab}
              </span>
            ))}
          </nav>
          <div className="reactor-monitor__panel">
            <p className="reactor-monitor__placeholder">
              Select a reactor to inspect it.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
