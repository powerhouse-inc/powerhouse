// @vitest-environment happy-dom
import {
  IN_MEMORY_PGLITE_STORAGE_FACTS,
  PGLITE_IDB_STORAGE_FACTS,
  POSTGRES_STORAGE_FACTS,
  UNKNOWN_STORAGE_FACTS,
  type ReactorStorageFacts,
} from "@powerhousedao/reactor";
import {
  GQL_CHANNEL_TYPE,
  LOCAL_CHANNEL_TYPE,
  POLLING_CHANNEL_TYPE,
  type ManagedReactor,
  type MonitorReach,
  type MonitorReactorInfo,
} from "@powerhousedao/reactor-monitor";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OverviewTab } from "./OverviewTab.js";

const LOCAL_ACCESS = { admin: true, sql: true } as const;

function info(
  storage: ReactorStorageFacts,
  syncChannels: readonly string[],
  overrides: Partial<MonitorReactorInfo> = {},
): MonitorReactorInfo {
  return {
    storage,
    workflows: false,
    syncChannels,
    access: LOCAL_ACCESS,
    ...overrides,
  };
}

function stubReactor(
  kind: ManagedReactor["kind"],
  reach: MonitorReach,
  reactorInfo: MonitorReactorInfo,
): ManagedReactor {
  return {
    name: `overview-${kind}`,
    kind,
    reach,
    info: reactorInfo,
    endpoint: "http://switchboard.test/graphql/inspection",
    adminInfo: () => Promise.reject(new Error("no worker in this test")),
  } as unknown as ManagedReactor;
}

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
  it("renders reach and info for an in-process idb reactor", () => {
    const view = render(
      <OverviewTab
        reactor={stubReactor(
          "in-process",
          { hosting: "in-process", inspection: "direct" },
          info(PGLITE_IDB_STORAGE_FACTS, [LOCAL_CHANNEL_TYPE]),
        )}
      />,
    );

    const grid = view.getByLabelText("Reactor capabilities");
    expect(grid.querySelectorAll(".rm-cap")).toHaveLength(7);
    const container = view.container as HTMLElement;
    expect(badgeFor(container, "Hosting")).toBe("in-process");
    expect(badgeFor(container, "Inspection")).toBe("direct");
    expect(badgeFor(container, "Storage")).toBe("pglite / idb");
    expect(badgeFor(container, "Durable")).toBe("yes");
    expect(badgeFor(container, "Workflows")).toBe("no");
    expect(badgeFor(container, "Sync channels")).toBe("local");
    expect(badgeFor(container, "Access")).toBe("admin, sql");
    expect(view.getByText(/engine forks child processes/)).toBeTruthy();
    expect(view.queryByText(/Processors|Self-heal/)).toBeNull();
  });

  it("shows a worker reactor over rpc with its host block", () => {
    const view = render(
      <OverviewTab
        reactor={stubReactor(
          "worker",
          { hosting: "worker", inspection: "rpc" },
          info(PGLITE_IDB_STORAGE_FACTS, [
            GQL_CHANNEL_TYPE,
            LOCAL_CHANNEL_TYPE,
          ]),
        )}
      />,
    );

    const container = view.container as HTMLElement;
    expect(badgeFor(container, "Hosting")).toBe("worker");
    expect(badgeFor(container, "Inspection")).toBe("rpc");
    expect(badgeFor(container, "Sync channels")).toBe("gql, local");
    expect(
      view.getByText(
        /gql: Switchboard GraphQL remotes.*local: brokered-MessagePort/,
      ),
    ).toBeTruthy();
    expect(view.getByRole("heading", { name: "Worker host" })).toBeTruthy();
  });

  it("tones an ephemeral store and an island's channels off, never as an error", () => {
    const view = render(
      <OverviewTab
        reactor={stubReactor(
          "in-process",
          { hosting: "in-process", inspection: "direct" },
          info(IN_MEMORY_PGLITE_STORAGE_FACTS, []),
        )}
      />,
    );

    const container = view.container as HTMLElement;
    expect(badgeFor(container, "Storage")).toBe("pglite / memory");
    expect(badgeFor(container, "Durable")).toBe("no");
    expect(badgeFor(container, "Sync channels")).toBe("none");
    expect(view.getByText(/this reactor is an island/)).toBeTruthy();
    const durable = [...container.querySelectorAll(".rm-cap")].find(
      (cell) => cell.querySelector(".rm-cap-label")?.textContent === "Durable",
    );
    expect(
      durable?.querySelector(".rm-badge")?.classList.contains("rm-badge-off"),
    ).toBe(true);
    expect(container.querySelectorAll(".rm-cap .rm-badge-error")).toHaveLength(
      0,
    );
  });

  it("says a worker whose info could not be read reports an unknown store", () => {
    const view = render(
      <OverviewTab
        reactor={stubReactor(
          "worker",
          { hosting: "worker", inspection: "rpc" },
          info(UNKNOWN_STORAGE_FACTS, [], {
            access: { admin: false, sql: false },
          }),
        )}
      />,
    );

    const container = view.container as HTMLElement;
    expect(badgeFor(container, "Storage")).toBe("unknown / unknown");
    expect(view.getByText(/could not report its store/)).toBeTruthy();
    expect(badgeFor(container, "Access")).toBe("operator");
  });

  it("describes a remote non-operator and its polling channel", () => {
    const view = render(
      <OverviewTab
        reactor={stubReactor(
          "remote",
          { hosting: "remote", inspection: "rpc" },
          info(POSTGRES_STORAGE_FACTS, [POLLING_CHANNEL_TYPE], {
            workflows: true,
            access: null,
          }),
        )}
      />,
    );

    const container = view.container as HTMLElement;
    expect(badgeFor(container, "Hosting")).toBe("remote");
    expect(badgeFor(container, "Storage")).toBe("postgres / server");
    expect(badgeFor(container, "Workflows")).toBe("yes");
    expect(badgeFor(container, "Access")).toBe("reads only");
    expect(
      view.getByText(/created by the peer that polls this reactor/),
    ).toBeTruthy();
    expect(view.getByTestId("remote-operator").textContent).toMatch(
      /requires an admin caller \(ADMINS\); add a bearer/,
    );
    expect(view.getByTestId("remote-levers").textContent).toMatch(
      /this host's inspection subgraph serves reads only/,
    );
    expect(
      view.getByTestId("remote-recheck").getAttribute("disabled"),
    ).not.toBeNull();
  });
});

describe("OverviewTab worker restart", () => {
  const worker = () =>
    stubReactor(
      "worker",
      { hosting: "worker", inspection: "rpc" },
      info(PGLITE_IDB_STORAGE_FACTS, [LOCAL_CHANNEL_TYPE]),
    );

  it("restarts a worker through onRestartWorker", async () => {
    const onRestartWorker = vi.fn(() => Promise.resolve());
    const view = render(
      <OverviewTab onRestartWorker={onRestartWorker} reactor={worker()} />,
    );

    fireEvent.click(view.getByTestId("worker-restart"));

    await waitFor(() => {
      expect(onRestartWorker).toHaveBeenCalledTimes(1);
    });
    expect(view.queryByTestId("worker-restart-error")).toBeNull();
  });

  it("shows why a restart failed", async () => {
    const view = render(
      <OverviewTab
        onRestartWorker={() => Promise.reject(new Error("host refused"))}
        reactor={worker()}
      />,
    );

    fireEvent.click(view.getByTestId("worker-restart"));

    const error = await waitFor(() => view.getByTestId("worker-restart-error"));
    expect(error.textContent).toContain("host refused");
  });

  it("disables restart without a handler", () => {
    const view = render(<OverviewTab reactor={worker()} />);

    expect(
      view.getByTestId("worker-restart").getAttribute("disabled"),
    ).not.toBeNull();
  });
});
