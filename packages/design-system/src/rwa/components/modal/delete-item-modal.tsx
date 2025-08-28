import {
  type DependentItemProps,
  Icon,
  Modal,
  tableLabels,
  type TableName,
} from "@powerhousedao/design-system";
import { type ComponentPropsWithoutRef, memo, useCallback } from "react";

export type RWADeleteItemModalProps = ComponentPropsWithoutRef<typeof Modal> & {
  readonly tableName: TableName;
  readonly dependentItemProps: DependentItemProps;
};

export const RWADeleteItemModal = memo(function RWADeleteItemModal(
  props: RWADeleteItemModalProps,
) {
  const { tableName, dependentItemProps, onOpenChange, open } = props;

  const tableLabel = tableLabels[tableName].toLowerCase();

  const handleCancel = useCallback(() => {
    onOpenChange?.(false);
  }, [onOpenChange]);
  return (
    <Modal
      contentProps={{
        className: "rounded-3xl",
      }}
      onOpenChange={onOpenChange}
      open={open}
      overlayProps={{
        className: "top-10",
      }}
    >
      <div className="w-[400px] p-6 text-slate-300">
        <div className="border-b border-slate-50 pb-2 text-2xl font-bold text-gray-800">
          Cannot delete {tableName}
        </div>
        <div className="my-6 flex gap-2 rounded-md bg-orange-100 p-4 text-orange-800">
          <div>
            <Icon className="mt-1 text-orange-800" name="Error" />
          </div>
          <div>
            Warning! Cannot delete this {tableLabel} because there are items
            that depend on it. Please change or delete those first.
          </div>
        </div>
        <div className="my-6 rounded-md bg-slate-50 p-4 text-slate-200">
          {dependentItemProps.map(({ dependentTableName, dependentItems }) => (
            <div key={dependentTableName}>
              <div className="mb-0.5 font-semibold" key={1}>
                {`${tableLabels[dependentTableName]}s: `}
              </div>
              {dependentItems.map(({ id, label }) => (
                <div key={id}>{label}</div>
              ))}
            </div>
          ))}
        </div>
        <div className="mt-8 flex justify-between gap-3">
          <button
            className="min-h-12 min-w-36 flex-1 rounded-xl bg-gray-800 px-6 py-3 text-base font-semibold text-gray-50 outline-none transition-all hover:scale-105 active:opacity-75"
            onClick={handleCancel}
          >
            Back
          </button>
        </div>
      </div>
    </Modal>
  );
});
