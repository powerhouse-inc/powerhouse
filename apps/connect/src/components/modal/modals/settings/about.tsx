import { connectConfig } from "@powerhousedao/connect/config";
import {
  getGitSha,
  getGitUrl,
  packageJson,
  shortGitSha,
} from "@powerhousedao/connect/utils";
import { Icon } from "@powerhousedao/design-system";
import { About as BaseAbout } from "@powerhousedao/design-system/connect";
import {
  closePHModal,
  driveCollectionId,
  showPHModal,
  useDrives,
  useDriveSystemInfo,
  useSyncList,
} from "@powerhousedao/reactor-browser";
import type { DocumentDriveDocument } from "@powerhousedao/shared/document-drive";
import { useMemo } from "react";

export const About: React.FC = () => {
  const onOpenInspector = () => {
    closePHModal();
    showPHModal({ type: "inspector" });
  };

  return (
    <div>
      <BaseAbout
        packageJson={packageJson}
        phCliVersion={
          typeof connectConfig.phCliVersion === "string"
            ? connectConfig.phCliVersion
            : undefined
        }
      />
      <AppGitHash />
      <ConnectedDrives />
      <div className="bg-background p-3">
        <h2 className="mb-2 font-semibold text-foreground">Inspector</h2>
        <p className="mb-3 text-sm font-normal text-foreground">
          Explore the local database and sync state for debugging.
        </p>
        <button
          className="flex items-center gap-x-2 rounded-md border border-border bg-transparent px-3 py-1 text-sm font-medium text-foreground transition-colors hover:hover-effect"
          onClick={onOpenInspector}
          type="button"
        >
          Open Inspector <Icon name="CircleInfo" size={16} />
        </button>
      </div>
    </div>
  );
};

function AppGitHash() {
  const sha = getGitSha();
  if (sha === "unknown") return null;
  const url = getGitUrl();
  const label = shortGitSha(sha);
  return (
    <div className="bg-background p-3 text-sm">
      <span className="font-semibold">Git hash: </span>
      {url ? (
        <a
          className="font-mono underline"
          href={url}
          target="_blank"
          rel="noreferrer noopener"
          title={sha}
        >
          {label}
        </a>
      ) : (
        <span className="font-mono" title={sha}>
          {label}
        </span>
      )}
    </div>
  );
}

function ConnectedDrives() {
  const drives = useDrives() ?? [];
  const remotes = useSyncList();

  const remoteDrives = useMemo(
    () =>
      drives.filter((d) =>
        remotes.some(
          (r) => r.collectionId === driveCollectionId("main", d.header.id),
        ),
      ),
    [drives, remotes],
  );

  return (
    <div className="my-4 bg-background p-3">
      <h2 className="mb-2 font-semibold text-foreground">Connected drives</h2>
      {remoteDrives.length === 0 ? (
        <p className="text-sm font-normal text-foreground">
          No connected remote drives.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {remoteDrives.map((drive) => (
            <DriveAboutEntry key={drive.header.id} drive={drive} />
          ))}
        </ul>
      )}
    </div>
  );
}

function DriveAboutEntry({ drive }: { drive: DocumentDriveDocument }) {
  const info = useDriveSystemInfo(drive);
  const name = drive.state.global.name || drive.header.name;

  return (
    <li className="text-sm text-foreground">
      <div className="flex items-baseline gap-2">
        <span className="font-medium">{name}</span>
        {info.status === "ready" && (
          <span className="text-xs text-muted-foreground">{info.host}</span>
        )}
      </div>
      {info.status === "loading" && (
        <div className="mt-1 text-xs text-muted-foreground">Loading…</div>
      )}
      {info.status === "error" && (
        <div className="mt-1 text-xs text-destructive">
          Could not load system info
        </div>
      )}
      {info.status === "ready" && (
        <div className="mt-1 text-xs text-foreground">
          <div>
            <span className="font-medium">Version:</span> {info.version}
          </div>
          <div>
            <span className="font-medium">Git hash: </span>
            {info.gitUrl ? (
              <a
                className="font-mono hover:underline"
                href={info.gitUrl}
                target="_blank"
                rel="noreferrer noopener"
                title={info.gitHash}
              >
                {shortGitSha(info.gitHash)}
              </a>
            ) : (
              <span className="font-mono" title={info.gitHash}>
                {shortGitSha(info.gitHash)}
              </span>
            )}
          </div>
        </div>
      )}
      {info.status === "local" && (
        <div className="mt-1 text-xs text-muted-foreground">
          Local drive — N/A
        </div>
      )}
    </li>
  );
}
