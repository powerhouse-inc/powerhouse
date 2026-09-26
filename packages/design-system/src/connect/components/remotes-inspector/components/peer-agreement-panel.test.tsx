import type {
  IPeerAgreement,
  Remote,
  SyncHold,
} from "@powerhousedao/reactor-browser";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RemotesInspector } from "../remotes-inspector.js";
import { PeerAgreementPanel } from "./peer-agreement-panel.js";

const COLLECTION = "drive.main.drive-1";

const local = {
  format: 1 as const,
  revision: "localrev0001",
  protocols: { "base-reducer": [1, 2, 3], signature: [2] },
  features: { "sync.anti-entropy": [1] },
};
const legacy = {
  protocols: { "base-reducer": [1, 2], signature: [2] },
  features: {},
};
const announced = {
  format: 1 as const,
  revision: "peerrev12345678",
  protocols: { "base-reducer": [1, 2], signature: [2] },
  features: {},
};

/** A fixed agreement: `narrow` lacks base-reducer 3, `wide` has it. */
const agreement: IPeerAgreement = {
  local: () => local,
  basis: () => ({ local, legacy, wanted: { "base-reducer": 3, signature: 2 } }),
  peer: (name) =>
    name === "wide"
      ? { protocols: local.protocols, features: local.features }
      : name === "narrow"
        ? announced
        : legacy,
  members: () => new Map(),
  limitedBy: (_collection, protocol) =>
    protocol === "base-reducer" ? ["narrow", "silent"] : [],
};

const hold: SyncHold = {
  remoteName: "narrow",
  documentId: "doc-at-3",
  branch: "main",
  reason: { protocol: "base-reducer", version: 3, peerSupports: [1, 2] },
  heldAtUtcMs: Date.UTC(2026, 8, 25),
};

function rowOf(label: string): HTMLElement {
  return screen.getByRole("cell", { name: label }).closest("tr")!;
}

describe("PeerAgreementPanel", () => {
  it("shows an announced peer's versions and what it limits", () => {
    render(
      <PeerAgreementPanel
        agreement={agreement}
        collectionId={COLLECTION}
        holds={[]}
        peer={{ manifest: announced, receivedAtUtcMs: 1 }}
        remoteName="narrow"
      />,
    );

    expect(screen.getByText("Announced, revision peerrev1")).toBeDefined();
    const baseReducer = within(rowOf("base-reducer"));
    expect(baseReducer.getByText("1, 2, 3")).toBeDefined();
    expect(baseReducer.getByText("1, 2")).toBeDefined();
    expect(baseReducer.getByText("Yes")).toBeDefined();
    expect(within(rowOf("signature")).getByText("No")).toBeDefined();
    expect(
      within(rowOf("sync.anti-entropy (feature)")).getByText("none"),
    ).toBeDefined();
    expect(screen.getByText("No documents held")).toBeDefined();
  });

  it("labels a silent peer and one not yet heard as baseline", () => {
    const { rerender } = render(
      <PeerAgreementPanel
        agreement={agreement}
        collectionId={COLLECTION}
        holds={[]}
        peer={{ manifest: null, receivedAtUtcMs: 1 }}
        remoteName="silent"
      />,
    );
    expect(screen.getByText("Silent (baseline)")).toBeDefined();

    rerender(
      <PeerAgreementPanel
        agreement={agreement}
        collectionId={COLLECTION}
        holds={[]}
        peer={undefined}
        remoteName="silent"
      />,
    );
    expect(screen.getByText("Not yet heard (baseline)")).toBeDefined();
  });

  it("lists held documents with their reason", () => {
    render(
      <PeerAgreementPanel
        agreement={agreement}
        collectionId={COLLECTION}
        holds={[hold]}
        peer={{ manifest: announced, receivedAtUtcMs: 1 }}
        remoteName="narrow"
      />,
    );

    expect(screen.getByText("Held documents (1)")).toBeDefined();
    const row = within(rowOf("doc-at-3"));
    expect(row.getByText("base-reducer 3")).toBeDefined();
    expect(row.getByText("1, 2")).toBeDefined();
  });
});

describe("RemotesInspector peer agreement", () => {
  const remote = {
    meta: {
      id: "remote-id-1",
      name: "narrow",
      collectionId: { key: COLLECTION, driveId: "drive-1", branch: "main" },
      channelConfig: { type: "gql", parameters: {} },
      filter: { documentId: [], scope: [], branch: "main" },
      options: {},
      peer: { manifest: announced, receivedAtUtcMs: 1 },
    },
    channel: {
      inbox: { items: [], isPaused: () => false },
      outbox: { items: [], isPaused: () => false },
      deadLetter: { items: [], isPaused: () => false },
    },
  } as unknown as Remote;

  it("shows the peer in the list and its agreement and holds on the remote", async () => {
    render(
      <RemotesInspector
        getAgreement={() => agreement}
        getHolds={() => Promise.resolve([hold])}
        getRemotes={() => Promise.resolve([remote])}
      />,
    );

    expect(
      await screen.findByText("Announced, revision peerrev1"),
    ).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: /view/i }));

    const panel = await screen.findByRole("region", {
      name: "Peer agreement",
    });
    expect(await within(panel).findByText("doc-at-3")).toBeDefined();
  });
});
