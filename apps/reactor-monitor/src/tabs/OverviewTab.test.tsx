// @vitest-environment happy-dom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  reactorCapabilities,
  type ManagedReactor,
  type ReactorDescriptor,
} from "@powerhousedao/reactor-monitor";
import { OverviewTab } from "./OverviewTab.js";

/**
 * The Overview tab renders the stage-2 capability contract
 * (docs/plans/2026-10-03-multi-reactor.md), so this asserts that the
 * worker/in-process variance is visible at a glance rather than buried in
 * prose. The reactor is a stub around real `reactorCapabilities` output: the
 * grid reads nothing else off the handle, and provisioning a PGlite here
 * would test the store, not the view.
 */
function stubReactor(descriptor: ReactorDescriptor): ManagedReactor {
  return {
    name: descriptor.name,
    kind: descriptor.kind,
    capabilities: reactorCapabilities(descriptor),
    // Worker reactors render AdminInfo, which calls this; a rejection
    // exercises its error branch without a worker.
    adminInfo: () => Promise.reject(new Error("no worker in this test")),
  } as unknown as ManagedReactor;
}

/** The badge value rendered next to a capability label. */
function badgeFor(container: HTMLElement, label: string): string {
  const cell = [...container.querySelectorAll(".rm-cap")].find(
    (node) => node.querySelector(".rm-cap-label")?.textContent === label,
  );
  if (!cell) {
    throw new Error(`No capability cell labelled "${label}"`);
  }
  return cell.querySelector(".rm-badge")?.textContent ?? "";
}

describe("OverviewTab capability grid", () => {
  it("renders every capability field for an in-process local-sync reactor", () => {
    const view = render(
      <OverviewTab
        reactor={stubReactor({
          kind: "in-process",
          name: "overview-in-process",
          sync: { local: true },
        })}
      />,
    );

    const grid = view.getByLabelText("Reactor capabilities");
    expect(grid.querySelectorAll(".rm-cap")).toHaveLength(7);
    const container = view.container as HTMLElement;
    expect(badgeFor(container, "Hosting")).toBe("in-process");
    expect(badgeFor(container, "Storage")).toBe("idb");
    expect(badgeFor(container, "Processors")).toBe("yes");
    expect(badgeFor(container, "Workflows")).toBe("no");
    expect(badgeFor(container, "Inspection")).toBe("direct");
    expect(badgeFor(container, "Sync channels")).toBe("local");
    expect(badgeFor(container, "Self-heal")).toBe("yes");
    // The engine is Node-only, and the grid says why.
    expect(view.getByText(/engine forks child processes/)).toBeTruthy();
  });

  it("shows the worker reactor's two capability differences", () => {
    const view = render(
      <OverviewTab
        reactor={stubReactor({
          kind: "worker",
          name: "overview-worker",
          sync: { local: true },
        })}
      />,
    );

    const container = view.container as HTMLElement;
    expect(badgeFor(container, "Hosting")).toBe("worker");
    // The two realm-forced differences from the in-process case above.
    expect(badgeFor(container, "Processors")).toBe("no");
    expect(badgeFor(container, "Inspection")).toBe("rpc");
    expect(view.getByText(/does not survive postMessage/)).toBeTruthy();
    // Worker-only section; the in-process case renders no admin block.
    expect(view.getByRole("heading", { name: "Worker host" })).toBeTruthy();
  });

  it("marks an ephemeral store undurable and unhealable", () => {
    const view = render(
      <OverviewTab
        reactor={stubReactor({
          kind: "in-process",
          name: "overview-memory",
          storage: { kind: "memory" },
        })}
      />,
    );

    const container = view.container as HTMLElement;
    expect(badgeFor(container, "Storage")).toBe("memory");
    expect(badgeFor(container, "Self-heal")).toBe("no");
    // A gql-mode reactor, so the sync-channel cell differs too.
    expect(badgeFor(container, "Sync channels")).toBe("gql");
    expect(view.getByText(/no durable store to reopen/)).toBeTruthy();
  });

  it("tones a lacked capability as off rather than as an error", () => {
    const view = render(
      <OverviewTab
        reactor={stubReactor({
          kind: "worker",
          name: "overview-tone",
          sync: { local: true },
        })}
      />,
    );

    const cells = [...view.container.querySelectorAll(".rm-cap")];
    const processors = cells.find(
      (cell) =>
        cell.querySelector(".rm-cap-label")?.textContent === "Processors",
    );
    expect(
      processors
        ?.querySelector(".rm-badge")
        ?.classList.contains("rm-badge-off"),
    ).toBe(true);
    // Nothing in the grid is painted as a failure.
    expect(
      view.container.querySelectorAll(".rm-cap .rm-badge-error"),
    ).toHaveLength(0);
  });
});
