import {
  CURRENT_PG_MAJOR,
  getCachedReactorPgMajor,
  migrateAllIfNeeded,
  subscribeReactorPgMajor,
} from "@powerhousedao/connect/utils";
import { useReactorClientModule } from "@powerhousedao/reactor-browser";
import type { IWorkerAdminClient } from "@powerhousedao/reactor-browser/rpc";
import { useState, useSyncExternalStore } from "react";

function BannerShell({
  title,
  body,
  error,
  children,
}: {
  title: string;
  body: string;
  error?: string | null;
  children?: React.ReactNode;
}) {
  return (
    <div className="absolute inset-x-0 top-0 z-30 flex justify-center p-3">
      <div className="flex max-w-3xl items-center gap-3 rounded-lg border border-warning bg-warning px-4 py-3 text-sm text-warning-foreground shadow-lg">
        <div className="flex-1">
          <div className="font-semibold">{title}</div>
          <div className="text-foreground">{body}</div>
          {error && (
            <div className="mt-2 font-medium text-destructive">
              Migration failed: {error}
            </div>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

const actionButton =
  "rounded-sm bg-primary px-3 py-1 text-sm font-medium text-primary-foreground hover:hover-effect disabled:disabled-effect";
const dismissButton =
  "rounded-sm border border-foreground bg-transparent px-3 py-1 text-sm font-medium text-foreground hover:hover-effect disabled:disabled-effect";

let browserDismissed = false;
const browserListeners = new Set<() => void>();

function WorkerMigrationBanner({
  adminClient,
}: {
  adminClient: IWorkerAdminClient;
}) {
  const state = useSyncExternalStore(
    (cb) => adminClient.subscribeMigration(cb),
    () => adminClient.getMigrationState(),
  );
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (state.status === "idle") return null;
  if (state.status === "needed" && dismissed) return null;

  const migrating = state.status === "migrating";
  const handleMigrate = () => {
    setError(null);
    adminClient.migrate().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : String(err));
    });
  };

  return (
    <BannerShell
      title={
        migrating
          ? `Migrating to Postgres ${CURRENT_PG_MAJOR}…`
          : `Your local database uses Postgres ${state.legacyMajor ?? "?"}.`
      }
      body={
        migrating
          ? `Working (${state.phase ?? "starting"}). Your data is backed up first.`
          : `Migrate to Postgres ${CURRENT_PG_MAJOR} to pick up the latest features. Your data will be backed up first.`
      }
      error={error ?? (state.status === "failed" ? state.error : null)}
    >
      {!migrating && (
        <button type="button" onClick={handleMigrate} className={actionButton}>
          {state.status === "failed" ? "Retry" : "Migrate now"}
        </button>
      )}
      {state.status === "needed" && (
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className={dismissButton}
        >
          Dismiss
        </button>
      )}
    </BannerShell>
  );
}

function BrowserMigrationBanner() {
  const isDismissed = useSyncExternalStore(
    (cb) => {
      browserListeners.add(cb);
      return () => browserListeners.delete(cb);
    },
    () => browserDismissed,
    () => false,
  );
  const major = useSyncExternalStore(
    subscribeReactorPgMajor,
    getCachedReactorPgMajor,
    () => undefined,
  );
  const [migrating, setMigrating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (major === undefined || major === null || major === CURRENT_PG_MAJOR) {
    return null;
  }
  if (isDismissed) return null;

  const handleMigrate = () => {
    setError(null);
    setMigrating(true);
    migrateAllIfNeeded()
      .then(() => window.location.reload())
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
        setMigrating(false);
      });
  };

  return (
    <BannerShell
      title={`Your local database uses Postgres ${major}.`}
      body={`Migrate to Postgres ${CURRENT_PG_MAJOR} to pick up the latest features. Your data will be backed up first.`}
      error={error}
    >
      <button
        type="button"
        disabled={migrating}
        onClick={handleMigrate}
        className={actionButton}
      >
        {migrating ? "Migrating…" : "Migrate now"}
      </button>
      <button
        type="button"
        disabled={migrating}
        onClick={() => {
          browserDismissed = true;
          for (const l of browserListeners) l();
        }}
        className={dismissButton}
      >
        Dismiss
      </button>
    </BannerShell>
  );
}

export const MigrationBanner: React.FC = () => {
  const module = useReactorClientModule();
  if (module?.kind === "worker") {
    return <WorkerMigrationBanner adminClient={module.adminClient} />;
  }
  return <BrowserMigrationBanner />;
};
