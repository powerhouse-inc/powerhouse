import { InspectorModal as ConnectInspectorModal } from "@powerhousedao/design-system/connect";
import { closePHModal, REACTOR_SCHEMA, usePHModal } from "@powerhousedao/reactor-browser";
import { useDbExplorer } from "./useDbExplorer.js";
import { useDebugInspector } from "./useDebugInspector.js";
import { useIntegrityInspector } from "./useIntegrityInspector.js";
import { useProcessorsInspector } from "./useProcessorsInspector.js";
import { useQueueInspector } from "./useQueueInspector.js";
import { useRemotesInspector } from "./useRemotesInspector.js";
import { useWorkerInspector } from "./useWorkerInspector.js";

const DEFAULT_PAGE_SIZE = 25;

const WORKER_DEFERRED_NOTE =
  "Not available in worker mode yet — this reads reactor internals that live in the SharedWorker and aren't bridged over RPC. Coming in Phase 3.";

export const InspectorModal: React.FC = () => {
  const phModal = usePHModal();
  const open = phModal?.type === "inspector";

  const { getTables, getTableRows, getDefaultSort, onExportDb, onImportDb } =
    useDbExplorer();
  const {
    getRemotes,
    removeRemote,
    addRemoteManual,
    triggerPull,
    connectionStates,
  } = useRemotesInspector();
  const queueInspectorProps = useQueueInspector();
  const processorsInspectorProps = useProcessorsInspector();
  const integrityInspectorProps = useIntegrityInspector();
  const workerInspectorProps = useWorkerInspector();
  const { currentPgVersion, supportedPgVersions, onResetToPgVersion } =
    useDebugInspector();

  const unavailableTabs = workerInspectorProps
    ? {
        Queue: WORKER_DEFERRED_NOTE,
        Processors: WORKER_DEFERRED_NOTE,
        Integrity: WORKER_DEFERRED_NOTE,
      }
    : undefined;

  return (
    <ConnectInspectorModal
      open={open}
      onOpenChange={(status) => {
        if (!status) closePHModal();
      }}
      dbExplorerProps={{
        schema: REACTOR_SCHEMA,
        getTables,
        getTableRows,
        getDefaultSort,
        pageSize: DEFAULT_PAGE_SIZE,
        onExportDb,
        onImportDb,
        pgVersionControl: {
          currentPgVersion,
          supportedPgVersions,
          onResetToPgVersion,
        },
      }}
      remotesInspectorProps={{
        getRemotes,
        removeRemote,
        addRemoteManual,
        triggerPull,
        connectionStates,
      }}
      queueInspectorProps={queueInspectorProps}
      processorsInspectorProps={processorsInspectorProps}
      integrityInspectorProps={integrityInspectorProps}
      workerInspectorProps={workerInspectorProps}
      unavailableTabs={unavailableTabs}
    />
  );
};
