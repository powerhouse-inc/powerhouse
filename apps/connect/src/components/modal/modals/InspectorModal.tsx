import { InspectorModal as ConnectInspectorModal } from "@powerhousedao/design-system/connect";
import { closePHModal, usePHModal } from "@powerhousedao/reactor-browser";

// TODO: Import actual hooks for DB and remotes data

export const InspectorModal: React.FC = () => {
  const phModal = usePHModal();
  const open = phModal?.type === "inspector";

  return (
    <ConnectInspectorModal
      open={open}
      onOpenChange={(status) => {
        if (!status) closePHModal();
      }}
      dbExplorerProps={{
        schema: "public",
        // TODO: Wire up actual database functions
        getTables: () => Promise.resolve([]),
        getTableRows: () =>
          Promise.resolve({
            columns: [],
            rows: [],
            total: 0,
          }),
      }}
      remotesInspectorProps={{
        // TODO: Wire up actual remotes data
        remotes: [],
        onRefresh: () => {},
      }}
    />
  );
};
