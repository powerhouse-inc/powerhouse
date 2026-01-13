import { InspectorModal as ConnectInspectorModal } from "@powerhousedao/design-system/connect";
import { REACTOR_SCHEMA } from "@powerhousedao/reactor";
import { closePHModal, usePHModal } from "@powerhousedao/reactor-browser";
import { useDbExplorer } from "./useDbExplorer.js";
import { useRemotesInspector } from "./useRemotesInspector.js";

const DEFAULT_PAGE_SIZE = 25;

export const InspectorModal: React.FC = () => {
  const phModal = usePHModal();
  const open = phModal?.type === "inspector";

  const { getTables, getTableRows, getDefaultSort, onExportDb, onImportDb } =
    useDbExplorer();
  const { getRemotes } = useRemotesInspector();

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
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        getDefaultSort,
        pageSize: DEFAULT_PAGE_SIZE,
        onExportDb,
        onImportDb,
      }}
      remotesInspectorProps={{
        getRemotes,
      }}
    />
  );
};
