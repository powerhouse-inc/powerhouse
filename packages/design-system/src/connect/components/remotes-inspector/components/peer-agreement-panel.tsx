import type {
  IPeerAgreement,
  RemotePeer,
  SyncHold,
} from "@powerhousedao/reactor-browser";
import { twMerge } from "tailwind-merge";

export type PeerAgreementPanelProps = {
  readonly remoteName: string;
  readonly collectionId: string;
  readonly peer: RemotePeer | undefined;
  readonly agreement: IPeerAgreement;
  readonly holds: readonly SyncHold[];
};

const cell = "px-3 py-1.5 text-xs text-foreground";
const head = "px-3 py-1.5 text-left text-xs font-medium text-foreground";

function versions(list: readonly number[] | undefined): string {
  return list && list.length > 0 ? list.join(", ") : "none";
}

/** How a remote's peer announced itself. */
export function peerManifestLabel(peer: RemotePeer | undefined): string {
  if (peer === undefined) return "Not yet heard (baseline)";
  if (peer.manifest === null) return "Silent (baseline)";
  return `Announced, revision ${peer.manifest.revision.slice(0, 8)}`;
}

export function PeerAgreementPanel({
  remoteName,
  collectionId,
  peer,
  agreement,
  holds,
}: PeerAgreementPanelProps) {
  const local = agreement.local();
  const theirs = agreement.peer(remoteName);
  const protocols = Object.keys(local.protocols).sort();
  const features = Object.keys(local.features).sort();

  return (
    <section
      aria-label="Peer agreement"
      className="flex flex-col gap-2 rounded-lg border border-border p-3"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          Peer agreement
        </h3>
        <span className="text-xs text-muted-foreground">
          {peerManifestLabel(peer)}
        </span>
      </div>

      <table className="w-full border-collapse">
        <thead className="bg-muted">
          <tr>
            <th className={head}>Protocol</th>
            <th className={head}>Local</th>
            <th className={head}>Peer</th>
            <th className={head}>Limits new documents</th>
          </tr>
        </thead>
        <tbody>
          {protocols.map((protocol) => {
            const limits = agreement
              .limitedBy(collectionId, protocol)
              .includes(remoteName);
            return (
              <tr key={protocol} className="odd:bg-card even:bg-background">
                <td className={cell}>{protocol}</td>
                <td className={cell}>{versions(local.protocols[protocol])}</td>
                <td className={cell}>{versions(theirs.protocols[protocol])}</td>
                <td className={twMerge(cell, limits && "text-warning")}>
                  {limits ? "Yes" : "No"}
                </td>
              </tr>
            );
          })}
          {features.map((feature) => (
            <tr key={feature} className="odd:bg-card even:bg-background">
              <td className={cell}>{feature} (feature)</td>
              <td className={cell}>{versions(local.features[feature])}</td>
              <td className={cell}>{versions(theirs.features[feature])}</td>
              <td className={cell}>-</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h4 className="text-xs font-semibold text-foreground">
        Held documents ({holds.length})
      </h4>
      {holds.length === 0 ? (
        <p className="text-xs text-muted-foreground">No documents held</p>
      ) : (
        <table className="w-full border-collapse">
          <thead className="bg-muted">
            <tr>
              <th className={head}>Document</th>
              <th className={head}>Branch</th>
              <th className={head}>Requires</th>
              <th className={head}>Peer runs</th>
              <th className={head}>Held since</th>
            </tr>
          </thead>
          <tbody>
            {holds.map((hold) => (
              <tr
                key={`${hold.documentId}:${hold.branch}`}
                className="odd:bg-card even:bg-background"
              >
                <td className={cell}>{hold.documentId}</td>
                <td className={cell}>{hold.branch}</td>
                <td className={cell}>
                  {hold.reason.protocol} {hold.reason.version}
                </td>
                <td className={cell}>{versions(hold.reason.peerSupports)}</td>
                <td className={cell}>
                  {new Date(hold.heldAtUtcMs).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
