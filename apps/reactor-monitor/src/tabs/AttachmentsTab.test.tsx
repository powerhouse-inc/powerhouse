// @vitest-environment happy-dom
import type {
  AttachmentReplicationEntry,
  AttachmentReplicatorStatus,
  ManagedAttachments,
  ManagedReactor,
  ReactorKind,
} from "@powerhousedao/reactor-monitor";
import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AttachmentsTab } from "./AttachmentsTab.js";

/**
 * The tab's job is to keep the two honest failure modes apart -- bytes nobody
 * has, versus a peer whose reference index has not caught up -- so these
 * assert that both counts are rendered and that a reactor WITHOUT a store says
 * so instead of rendering zeroes that look like a healthy empty state
 * (multi-reactor W3.4).
 */
function status(
  overrides: Partial<AttachmentReplicatorStatus> = {},
): AttachmentReplicatorStatus {
  return {
    running: true,
    refsSeen: 3,
    held: 1,
    bytesHeld: 2048,
    queued: 0,
    fetching: 0,
    waiting: 1,
    notFound: 1,
    failed: 0,
    backlogScanned: false,
    lastError: undefined,
    ...overrides,
  };
}

function entry(
  overrides: Partial<AttachmentReplicationEntry> = {},
): AttachmentReplicationEntry {
  return {
    hash: "a".repeat(64),
    state: "not-found",
    documentIds: ["document-1"],
    attempts: 3,
    notFoundAnswers: 3,
    nextAttemptAtMs: undefined,
    lastError: undefined,
    ...overrides,
  };
}

function stubReactor(
  attachments: ManagedAttachments | undefined,
  kind: ReactorKind = "in-process",
): ManagedReactor {
  return { name: "alpha", kind, attachments } as unknown as ManagedReactor;
}

function stubAttachments(
  overrides: Partial<ManagedAttachments> = {},
): ManagedAttachments {
  return {
    store: {} as ManagedAttachments["store"],
    storeKind: "memory",
    status: () => Promise.resolve(status()),
    report: () => [entry()],
    retry: () => undefined,
    servedStats: () => ({ served: 2, bytesServed: 4096, refused: 1 }),
    peers: () => ["beta"],
    switchboardSources: () => [],
    adoptPeer: () => Promise.resolve(),
    removePeer: () => Promise.resolve(),
    ...overrides,
  };
}

describe("AttachmentsTab", () => {
  it("renders the replicator counts, keeping waiting and not-found apart", async () => {
    const view = render(
      <AttachmentsTab reactor={stubReactor(stubAttachments())} />,
    );

    const counts = await waitFor(() => {
      const node = view.getByTestId("attachments-counts");
      expect(node.textContent).toContain("Refs seen: 3");
      return node;
    });
    expect(counts.textContent).toContain("Held: 1");
    expect(counts.textContent).toContain("Bytes held: 2.0 KiB");
    expect(counts.textContent).toContain("Waiting: 1");
    expect(counts.textContent).toContain("Not found: 1");
    expect(counts.textContent).toContain("Failed: 0");
    expect(counts.textContent).toContain("Served to peers:");
    expect(counts.textContent).toContain("4.0 KiB");
  });

  it("names the byte sources and reports an unfinished boot re-scan honestly", async () => {
    const view = render(
      <AttachmentsTab
        reactor={stubReactor(
          stubAttachments({
            peers: () => ["beta", "gamma"],
            switchboardSources: () => ["http://localhost:4001"],
          }),
        )}
      />,
    );

    const sources = await waitFor(() =>
      view.getByTestId("attachments-sources"),
    );
    expect(sources.textContent).toContain("beta, gamma");
    expect(sources.textContent).toContain("http://localhost:4001");
    expect(view.container.textContent).toContain("no reference index");
  });

  it("shows the per-hash table with its state and not-found answers", async () => {
    const view = render(
      <AttachmentsTab reactor={stubReactor(stubAttachments())} />,
    );
    await waitFor(() => {
      expect(view.container.querySelectorAll("tbody tr")).toHaveLength(1);
    });
    const row = view.container.querySelector("tbody tr") as HTMLElement;
    expect(row.textContent).toContain("not-found");
    expect(row.textContent).toContain("aaaaaaaaaaaa");
  });

  it("pulls the retry lever", async () => {
    const retry = vi.fn();
    const view = render(
      <AttachmentsTab reactor={stubReactor(stubAttachments({ retry }))} />,
    );
    const button = await waitFor(() =>
      view.getByRole("button", { name: "Re-chase missing bytes" }),
    );
    button.click();
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("surfaces a transport error rather than a silent zero", async () => {
    const view = render(
      <AttachmentsTab
        reactor={stubReactor(
          stubAttachments({
            status: () =>
              Promise.resolve(status({ lastError: "port is closed" })),
          }),
        )}
      />,
    );
    const note = await waitFor(() =>
      view.getByTestId("attachments-last-error"),
    );
    expect(note.textContent).toContain("port is closed");
  });

  it("states that a reactor without a store neither holds nor serves bytes", () => {
    const view = render(<AttachmentsTab reactor={stubReactor(undefined)} />);
    const panel = view.getByTestId("attachments-unavailable");
    expect(panel.textContent).toContain("holds no attachment byte store");
    expect(panel.textContent).toContain("provision form");
    expect(view.queryByTestId("attachments-counts")).toBeNull();
  });

  it("explains the worker and remote cases by name", () => {
    const worker = render(
      <AttachmentsTab reactor={stubReactor(undefined, "worker")} />,
    );
    expect(worker.container.textContent).toContain("cross the RPC boundary");
    worker.unmount();

    const remote = render(
      <AttachmentsTab reactor={stubReactor(undefined, "remote")} />,
    );
    expect(remote.container.textContent).toContain(
      "belongs to that deployment",
    );
  });
});
