// @vitest-environment happy-dom
import { fireEvent, render, waitFor, within } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ReactorMonitorRegistry,
  type ReactorDescriptor,
} from "@powerhousedao/reactor-monitor";
import { ReactorMonitorProvider } from "@powerhousedao/reactor-monitor/react";
import type { RouterTableSnapshot } from "@powerhousedao/reactor-router";
import { RoutingPanel } from "./RoutingPanel.js";

// Each in-process reactor boots a whole PGlite (WASM + migrations); the same
// allowance the rest of this app's suite makes.
const WAIT = { timeout: 30_000 } as const;

/** In-memory, in-process: leaves nothing behind, and needs no browser store. */
function memoryDescriptor(name: string): ReactorDescriptor {
  return { kind: "in-process", name, storage: { kind: "memory" } };
}

const ALPHA = "router-alpha";
const BETA = "router-beta";
const descriptors = [memoryDescriptor(ALPHA), memoryDescriptor(BETA)];

/**
 * Two real in-process reactors behind one shared registry, each holding one
 * drive created directly on it -- the realistic starting point for a router: a
 * topology it did not create, whose drive ids are only knowable after the fact
 * (the reference DriveClient mints them).
 */
describe("RoutingPanel over two in-process backends", () => {
  let registry: ReactorMonitorRegistry;
  let driveA = "";
  let driveB = "";

  function renderPanel() {
    // The registry is passed AND the descriptors name the already-provisioned
    // reactors, so the provider keeps them (does not re-provision, does not
    // reconcile them away) and does not kill them when a test unmounts.
    return render(
      <ReactorMonitorProvider descriptors={descriptors} registry={registry}>
        <RoutingPanel />
      </ReactorMonitorProvider>,
    );
  }

  function routerHandle(): { describeRouting?: () => RouterTableSnapshot } {
    const win = window as unknown as {
      __reactorMonitor?: {
        router?: { describeRouting?: () => RouterTableSnapshot };
      };
    };
    return win.__reactorMonitor?.router ?? {};
  }

  async function build(view: ReturnType<typeof renderPanel>): Promise<void> {
    await waitFor(
      () =>
        expect(view.getByTestId(`router-backend-option-${ALPHA}`)).toBeTruthy(),
      WAIT,
    );
    fireEvent.click(view.getByTestId(`router-backend-option-${ALPHA}`));
    fireEvent.click(view.getByTestId(`router-backend-option-${BETA}`));
    fireEvent.click(view.getByTestId("router-build"));
    await waitFor(() => expect(view.getByTestId("router-table")).toBeTruthy());
  }

  beforeAll(async () => {
    registry = new ReactorMonitorRegistry();
    const alpha = await registry.provision(descriptors[0]);
    const beta = await registry.provision(descriptors[1]);
    const createdA = await alpha.client.drives.create({
      global: { name: "Alpha" },
    });
    const createdB = await beta.client.drives.create({
      global: { name: "Beta" },
    });
    driveA = createdA.header.id;
    driveB = createdB.header.id;
  }, 60_000);

  afterAll(async () => {
    await registry.killAll();
  });

  it("builds a router, creates a drive through it, and renders a describeRouting row plus the dev handle", async () => {
    const view = renderPanel();
    await build(view);

    // Both backends, with their capability summaries.
    expect(view.getByTestId(`router-backend-${ALPHA}`)).toBeTruthy();
    expect(view.getByTestId(`router-backend-${BETA}`)).toBeTruthy();

    // Create a drive THROUGH the router; it records the owner, so a routing
    // row appears.
    fireEvent.change(view.getByTestId("router-create-drive-name"), {
      target: { value: "ViaRouter" },
    });
    fireEvent.click(view.getByTestId("router-create-drive"));

    await waitFor(
      () => expect(view.getByTestId("router-create-result")).toBeTruthy(),
      WAIT,
    );
    const rows = view
      .getByTestId("router-table")
      .querySelectorAll('[data-testid^="router-route-"]');
    expect(rows.length).toBeGreaterThanOrEqual(1);

    // The dev-only scripting handle is live and describes the topology.
    const handle = routerHandle();
    expect(handle.describeRouting).toBeTypeOf("function");
    expect([...(handle.describeRouting?.().backends ?? [])].sort()).toEqual(
      [ALPHA, BETA].sort(),
    );
  }, 60_000);

  it("shows a set override on the table with the override evidence badge", async () => {
    const view = renderPanel();
    await build(view);

    fireEvent.change(view.getByTestId("router-override-key"), {
      target: { value: driveA },
    });
    fireEvent.change(view.getByTestId("router-override-backend"), {
      target: { value: ALPHA },
    });
    fireEvent.click(view.getByTestId("router-override-set"));

    await waitFor(
      () => expect(view.getByTestId(`router-route-${driveA}`)).toBeTruthy(),
      WAIT,
    );
    const row = view.getByTestId(`router-route-${driveA}`);
    expect(within(row).getByTestId("router-source").textContent).toBe(
      "override",
    );
    expect(within(row).getByText(ALPHA)).toBeTruthy();
  }, 60_000);

  it("merges a find across both backends and names which one answered", async () => {
    const view = renderPanel();
    await build(view);

    // The default type is the drive document type; both drives match.
    fireEvent.click(view.getByTestId("router-find"));

    await waitFor(
      () => expect(view.getByTestId("router-find-results")).toBeTruthy(),
      WAIT,
    );
    const hitA = await waitFor(
      () => view.getByTestId(`router-find-hit-${driveA}`),
      WAIT,
    );
    const hitB = view.getByTestId(`router-find-hit-${driveB}`);
    // Each hit names the backend that actually serves it: the merge carries
    // both reactors' drives, and provenance is right.
    expect(within(hitA).getByText(ALPHA)).toBeTruthy();
    expect(within(hitB).getByText(BETA)).toBeTruthy();
  }, 60_000);

  it("refuses a cross-backend batch with its named error", async () => {
    const view = renderPanel();
    await build(view);

    fireEvent.change(view.getByTestId("router-constraint-a"), {
      target: { value: driveA },
    });
    fireEvent.change(view.getByTestId("router-constraint-b"), {
      target: { value: driveB },
    });
    fireEvent.click(view.getByTestId("router-batch"));

    await waitFor(
      () =>
        expect(view.getByTestId("router-batch-error").textContent).toMatch(
          /CrossBackendBatchError/,
        ),
      WAIT,
    );
  }, 60_000);
});
