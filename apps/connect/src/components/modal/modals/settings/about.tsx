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
      <div className="bg-white p-3 dark:bg-slate-900">
        <h2 className="mb-2 font-semibold text-gray-700 dark:text-slate-200">
          Inspector
        </h2>
        <p className="mb-3 text-sm font-normal text-gray-600 dark:text-slate-300">
          Explore the local database and sync state for debugging.
        </p>
        <button
          className="flex items-center gap-x-2 rounded-md border border-gray-300 bg-transparent px-3 py-1 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-100 dark:border-slate-600 dark:text-slate-50 dark:hover:bg-slate-800"
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
    <div className="bg-white p-3 text-sm dark:bg-slate-900">
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
    <div className="my-4 bg-white p-3 dark:bg-slate-900">
      <h2 className="mb-2 font-semibold text-gray-700 dark:text-slate-200">
        Connected drives
      </h2>
      {remoteDrives.length === 0 ? (
        <p className="text-sm font-normal text-gray-600 dark:text-slate-300">
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
    <li className="text-sm text-gray-700 dark:text-slate-200">
      <div className="flex items-baseline gap-2">
        <span className="font-medium">{name}</span>
        {info.status === "ready" && (
          <span className="text-xs text-gray-500 dark:text-slate-400">
            {info.host}
          </span>
        )}
      </div>
      {info.status === "loading" && (
        <div className="mt-1 text-xs text-gray-400 dark:text-slate-500">
          Loading…
        </div>
      )}
      {info.status === "error" && (
        <div className="mt-1 text-xs text-red-600 dark:text-red-100">
          Could not load system info
        </div>
      )}
      {info.status === "ready" && (
        <div className="mt-1 text-xs text-gray-600 dark:text-slate-300">
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
        <div className="mt-1 text-xs text-gray-400 dark:text-slate-500">
          Local drive — N/A
        </div>
      )}
    </li>
  );
}
