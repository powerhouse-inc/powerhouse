import { Icon } from '@/powerhouse';
import {
    Item,
    ItemDetailsFormProps,
    ItemDetailsProps,
    RWAButton,
    RWADeleteItemModal,
} from '@/rwa';
import { ComponentType, useState } from 'react';
import { FieldValues } from 'react-hook-form';
import { twMerge } from 'tailwind-merge';

/**
 * Displays and allows creating or editing an item. Intended to be used with react-hook-form.
 *
 * @type TItem - Table item type, any record with an "id" field and any string keys
 * @type TFieldValues - Field values type for the forms, must satisfy FieldValues (from react-hook-form)
 *
 * @param item - The item to display or edit, must satisfy TableItem
 * @param itemName - Name of the item, e.g. "Transaction" or "Asset". Comes from the ancestor `Table` element
 * @param itemNumber - Number of the item, e.g. "1" or "2". Comes from the ancestor `Table` element. Usually is `index + 1` when editing an existing item, and `tableData.length + 1` when creating a new item
 * @param className - Additional classes to apply to the item details container
 * @param formInputs - Form inputs defined in the parent component. Intended to be a React component that accepts no props and registers form inputs with react-hook-form
 * @param operation - Operation to perform on the item. Can be 'view', 'edit', or 'create'. Defaults to 'view'
 * @param handleSubmit - Function to handle form submission, returned by the `useForm` hook which is called in the parent `*Details` element
 * @param onSubmit - Submit handler to be called by `handleSubmit`. defined in the parent `*Details` element
 * @param onSubmitDelete - Function to perform the delete operation on the item. Defined in the parent `*Details` element
 * @param reset - Function to reset the form, returned by the `useForm` hook which is called in the parent `*Details` element
 * @param setSelectedItem - Function to set the selected item in the parent `Table` element
 * @param setShowNewItemForm - Function to set the showNewItemForm state in the parent `Table` element
 * @param onCancel - Function to call when the cancel button is clicked if additional logic is required. The form is already reset and the item is deselected by default.
 */
export function ItemDetails<
    TItem extends Item,
    TFieldValues extends FieldValues = FieldValues,
>(
    props: ItemDetailsProps<TItem, TFieldValues> &
        ItemDetailsFormProps<TFieldValues> & {
            readonly submit: (e?: React.BaseSyntheticEvent) => Promise<void>;
            readonly formInputs: ComponentType;
        },
) {
    const {
        tableItem,
        itemName,
        className,
        operation = 'view',
        isAllowedToCreateDocuments,
        isAllowedToEditDocuments,
        isAllowedToDeleteItem = true,
        dependentItemProps,
        formInputs: FormInputs,
        setOperation,
        submit,
        onSubmitDelete,
        reset,
        setSelectedTableItem,
    } = props;

    const [showDeleteModal, setShowDeleteModal] = useState(false);

    const hasDependentItems = !!dependentItemProps?.dependentItemList.length;

    const isEditOperation = operation === 'edit';
    const isCreateOperation = operation === 'create';
    const isViewOperation = operation === 'view';
    const isAllowedToCreateOrEdit =
        isAllowedToCreateDocuments || isAllowedToEditDocuments;

    const showCancelButton = !isViewOperation && isAllowedToCreateOrEdit;
    const showSubmitButton = !isViewOperation && isAllowedToCreateOrEdit;
    const showDeleteButton =
        isEditOperation && isAllowedToEditDocuments && isAllowedToDeleteItem;
    const showEditButton = isViewOperation && isAllowedToEditDocuments;

    function handleCancel() {
        if (operation === 'edit') {
            setOperation('view');
            return;
        }
        reset();
        setSelectedTableItem(undefined);
        setOperation(null);
    }

    function handleDelete() {
        if (!tableItem) return;

        if (hasDependentItems) {
            setShowDeleteModal(true);
            return;
        }

        onSubmitDelete(tableItem.id);
        setSelectedTableItem(undefined);
    }

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
            {isCreateOperation ? 'Save' : 'Save Edits'}
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
            onClick={() => {
                setSelectedTableItem(tableItem);
                setOperation('edit');
            }}
        >
            Edit {itemName}
        </RWAButton>
    );

    return (
        <div
            className={twMerge(
                'flex flex-col rounded-md border border-gray-300 bg-white',
                className,
            )}
        >
            <div className="flex justify-between rounded-t-md border-b border-gray-300 bg-gray-100 p-3 font-semibold text-gray-800">
                <div className="flex items-center">
                    {tableItem?.itemNumber
                        ? `${itemName} #${tableItem.itemNumber}`
                        : `New ${itemName}`}
                </div>
                <div className="flex gap-x-2">
                    {showCancelButton ? cancelButton : null}
                    {showSubmitButton ? submitButton : null}
                    {showDeleteButton ? deleteButton : null}
                    {showEditButton ? editButton : null}
                </div>
            </div>
            <FormInputs />
            {dependentItemProps ? (
                <RWADeleteItemModal
                    {...dependentItemProps}
                    itemName={itemName.toLowerCase()}
                    onContinue={() => setShowDeleteModal(false)}
                    open={showDeleteModal}
                />
            ) : null}
        </div>
    );
}
