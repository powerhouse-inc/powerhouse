import { Icon } from "#powerhouse";
import {
  FormInputs,
  RWAButton,
  tableLabels,
  type TableName,
  useDependentItemProps,
  useEditorContext,
  useModal,
  useTableForm,
} from "#rwa";
import { memo, useCallback } from "react";

type Props = {
  readonly tableName: TableName;
};
export const ItemDetails = memo(function ItemDetails(props: Props) {
  const { tableName } = props;
  const { showModal, closeModal } = useModal();

  const {
    selectedTableItem,
    operation,
    viewItem,
    editItem,
    clearSelected,
    handleAction,
    isAllowedToCreateDocuments,
    isAllowedToEditDocuments,
    principalLenderAccountId,
  } = useEditorContext();

  const dependentItemProps = useDependentItemProps(
    tableName,
    selectedTableItem?.id,
  );
  const hasDependentItems = dependentItemProps.some(
    (p) => p.dependentItems.length > 0,
  );

  const isEditOperation = operation === "edit";
  const isCreateOperation = operation === "create";
  const isViewOperation = operation === "view";
  const isAllowedToCreateOrEdit =
    isAllowedToCreateDocuments || isAllowedToEditDocuments;
  const isPrincipalLenderAccount =
    tableName === "ACCOUNT" &&
    selectedTableItem?.id === principalLenderAccountId;
  const isAllowedToDeleteItem = !isPrincipalLenderAccount;
  const showCancelButton = !isViewOperation && isAllowedToCreateOrEdit;
  const showSubmitButton = !isViewOperation && isAllowedToCreateOrEdit;
  const showDeleteButton =
    isEditOperation && isAllowedToEditDocuments && isAllowedToDeleteItem;
  const showEditButton = isViewOperation && isAllowedToEditDocuments;
  const showCloseButton = isViewOperation;

  const tableLabel = tableLabels[tableName];

  const {
    submit,
    reset,
    formInputs: { inputs, additionalInputs },
  } = useTableForm({
    tableName,
    tableItem: selectedTableItem,
    operation,
  });

  const handleClose = useCallback(() => {
    reset();
    clearSelected();
  }, [clearSelected, reset]);

  const handleCancel = useCallback(() => {
    if (operation === "edit" && !!selectedTableItem) {
      viewItem(selectedTableItem, tableName);
      return;
    }
    handleClose();
  }, [handleClose, operation, selectedTableItem, tableName, viewItem]);

  const showDeleteModal = useCallback(() => {
    if (!isAllowedToDeleteItem || !hasDependentItems) return;

    showModal("deleteItem", {
      tableName,
      dependentItemProps,
    });
  }, [
    isAllowedToDeleteItem,
    hasDependentItems,
    showModal,
    tableName,
    dependentItemProps,
  ]);

  const handleDelete = useCallback(() => {
    if (!selectedTableItem) return;

    if (hasDependentItems) {
      showDeleteModal();
      return;
    }

    const editorDeleteActionType = `DELETE_${tableName}` as const;
    handleAction({
      type: editorDeleteActionType,
      payload: selectedTableItem,
    });
    clearSelected();
    closeModal();
  }, [
    selectedTableItem,
    hasDependentItems,
    tableName,
    handleAction,
    clearSelected,
    closeModal,
    showDeleteModal,
  ]);

  const onEditButtonClick = useCallback(() => {
    if (!selectedTableItem) return;
    editItem(selectedTableItem, tableName);
  }, [selectedTableItem, editItem, tableName]);

  const closeButton = (
    <RWAButton className="text-gray-600" onClick={handleClose}>
      Close
    </RWAButton>
  );

  const cancelButton = (
    <RWAButton className="text-gray-600" onClick={handleCancel}>
      Cancel
    </RWAButton>
  );

  const submitButton = (
    <RWAButton
      icon={<Icon name="Save" size={16} />}
      iconPosition="right"
      onClick={submit}
    >
      {isCreateOperation ? "Save" : "Save Edits"}
    </RWAButton>
  );

  const deleteButton = (
    <button onClick={handleDelete}>
      <Icon className="ml-3 text-red-800" name="Trash" size={22} />
    </button>
  );

  const editButton = (
    <RWAButton
      icon={<Icon name="Pencil" size={16} />}
      iconPosition="right"
      onClick={onEditButtonClick}
    >
      Edit {tableLabel}
    </RWAButton>
  );

  return (
    <div className="flex flex-col rounded-md border border-gray-300 bg-white">
      <div className="flex justify-between rounded-t-md border-b border-gray-300 bg-gray-100 p-3 font-semibold text-gray-800">
        <div className="flex items-center">
          {selectedTableItem?.itemNumber
            ? `${tableLabel} #${selectedTableItem.itemNumber}`
            : `New ${tableLabel}`}
        </div>
        <div className="flex gap-x-2">
          {showCancelButton ? cancelButton : null}
          {showCloseButton ? closeButton : null}
          {showSubmitButton ? submitButton : null}
          {showDeleteButton ? deleteButton : null}
          {showEditButton ? editButton : null}
        </div>
      </div>
      <FormInputs inputs={inputs} />
      {additionalInputs}
    </div>
  );
});
