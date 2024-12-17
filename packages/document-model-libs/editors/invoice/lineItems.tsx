/* eslint-disable react/jsx-max-depth */
/* eslint-disable react/jsx-no-bind */
/* eslint-disable react/button-has-type */
import { RWAButton } from '@powerhousedao/design-system';
import { DeleteLineItemInput } from 'document-models/invoice';
import { forwardRef, useState, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';

type LineItem = {
    currency: string;
    description: string;
    id: string;
    quantity: number;
    taxPercent: number;
    totalPriceTaxExcl: number;
    totalPriceTaxIncl: number;
    unitPriceTaxExcl: number;
    unitPriceTaxIncl: number;
};

type EditableLineItemProps = {
    readonly item: Partial<LineItem>;
    readonly onSave: (item: LineItem) => void;
    readonly onCancel: () => void;
    readonly currency: string;
};

const EditableLineItem = forwardRef(function EditableLineItem(
    props: EditableLineItemProps,
    ref: React.Ref<HTMLTableRowElement>,
) {
    const { item, onSave, onCancel, currency } = props;
    const [editedItem, setEditedItem] = useState<Partial<LineItem>>({
        ...item,
        currency,
        quantity: item.quantity ?? 0,
        taxPercent: item.taxPercent ?? 0,
        unitPriceTaxExcl: item.unitPriceTaxExcl ?? 0,
    });

    const calculatedValues = useMemo(() => {
        const quantity = editedItem.quantity ?? 0;
        const unitPriceTaxExcl = editedItem.unitPriceTaxExcl ?? 0;
        const taxPercent = editedItem.taxPercent ?? 0;

        const totalPriceTaxExcl = quantity * unitPriceTaxExcl;
        const taxAmount = totalPriceTaxExcl * (taxPercent / 100);
        const totalPriceTaxIncl = totalPriceTaxExcl + taxAmount;
        const unitPriceTaxIncl = unitPriceTaxExcl * (1 + taxPercent / 100);

        return {
            totalPriceTaxExcl,
            totalPriceTaxIncl,
            unitPriceTaxIncl,
        };
    }, [
        editedItem.quantity,
        editedItem.unitPriceTaxExcl,
        editedItem.taxPercent,
    ]);

    function handleInputChange(field: keyof LineItem) {
        return function handleChange(
            event: React.ChangeEvent<HTMLInputElement>,
        ) {
            const value = event.target.value;
            setEditedItem((prev) => ({
                ...prev,
                [field]:
                    field === 'description' ? value : parseFloat(value) || 0,
            }));
        };
    }

    function handleSave() {
        const completeItem: LineItem = {
            id: editedItem.id ?? uuidv4(),
            currency: editedItem.currency!,
            description: editedItem.description ?? '',
            quantity: editedItem.quantity ?? 0,
            taxPercent: editedItem.taxPercent ?? 0,
            unitPriceTaxExcl: editedItem.unitPriceTaxExcl ?? 0,
            unitPriceTaxIncl: calculatedValues.unitPriceTaxIncl,
            totalPriceTaxExcl: calculatedValues.totalPriceTaxExcl,
            totalPriceTaxIncl: calculatedValues.totalPriceTaxIncl,
        };
        onSave(completeItem);
    }

    return (
        <tr ref={ref}>
            <td className="border border-gray-200 p-3">
                <input
                    className="w-full p-1 border rounded"
                    onChange={handleInputChange('description')}
                    placeholder="Description"
                    type="text"
                    value={editedItem.description ?? ''}
                />
            </td>
            <td className="border border-gray-200 p-3">
                <input
                    className="w-full p-1 border rounded"
                    min="0"
                    onChange={handleInputChange('quantity')}
                    step="1"
                    type="number"
                    value={editedItem.quantity ?? ''}
                />
            </td>
            <td className="border border-gray-200 p-3">
                <input
                    className="w-full p-1 border rounded"
                    min="0"
                    onChange={handleInputChange('unitPriceTaxExcl')}
                    step="0.01"
                    type="number"
                    value={editedItem.unitPriceTaxExcl ?? ''}
                />
            </td>
            <td className="border border-gray-200 p-3">
                <input
                    className="w-full p-1 border rounded"
                    max="100"
                    min="0"
                    onChange={handleInputChange('taxPercent')}
                    step="0.1"
                    type="number"
                    value={editedItem.taxPercent ?? ''}
                />
            </td>
            <td className="border border-gray-200 p-3">
                {calculatedValues.totalPriceTaxExcl.toFixed(2)}
            </td>
            <td className="border border-gray-200 p-3">
                {calculatedValues.totalPriceTaxIncl.toFixed(2)}
            </td>
            <td className="border border-gray-200 p-3">
                <button
                    className="px-2 py-1 bg-gray-500 text-white rounded"
                    onClick={handleSave}
                >
                    Save
                </button>
                <button
                    className="px-2 py-1 bg-gray-500 text-white rounded"
                    onClick={onCancel}
                >
                    Cancel
                </button>
            </td>
        </tr>
    );
});

// Main component
type LineItemsTableProps = {
    readonly lineItems: LineItem[];
    readonly currency: string;
    readonly onAddItem: (item: LineItem) => void;
    readonly onUpdateItem: (item: LineItem) => void;
    readonly onDeleteItem: (input: DeleteLineItemInput) => void;
};

export function LineItemsTable({
    lineItems,
    currency,
    onAddItem,
    onUpdateItem,
    onDeleteItem,
}: LineItemsTableProps) {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [isAddingNew, setIsAddingNew] = useState(false);

    function handleAddClick() {
        setIsAddingNew(true);
    }

    function handleSaveNewItem(item: LineItem) {
        onAddItem(item);
        setIsAddingNew(false);
    }

    function handleCancelNewItem() {
        setIsAddingNew(false);
    }

    return (
        <div>
            <div className="flex justify-between items-center mb-4">
                <h4 className="text-xl font-semibold">Line Items</h4>
                <RWAButton
                    className="mb-2"
                    disabled={isAddingNew}
                    onClick={handleAddClick}
                >
                    Add Line Item
                </RWAButton>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full border-collapse mb-6">
                    <thead>
                        <tr className="bg-gray-100">
                            <th className="border border-gray-200 p-3 text-left">
                                Description
                            </th>
                            <th className="border border-gray-200 p-3 text-left">
                                Quantity
                            </th>
                            <th className="border border-gray-200 p-3 text-left">
                                Unit Price (excl. tax)
                            </th>
                            <th className="border border-gray-200 p-3 text-left">
                                Tax %
                            </th>
                            <th className="border border-gray-200 p-3 text-left">
                                Total (excl. tax)
                            </th>
                            <th className="border border-gray-200 p-3 text-left">
                                Total (incl. tax)
                            </th>
                            <th className="border border-gray-200 p-3 text-left">
                                Actions
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {lineItems.map((item) =>
                            editingId === item.id ? (
                                <EditableLineItem
                                    currency={currency}
                                    item={item}
                                    key={item.id}
                                    onCancel={() => setEditingId(null)}
                                    onSave={(updatedItem) => {
                                        onUpdateItem(updatedItem);
                                        setEditingId(null);
                                    }}
                                />
                            ) : (
                                <tr key={item.id}>
                                    <td className="border border-gray-200 p-3">
                                        {item.description}
                                    </td>
                                    <td className="border border-gray-200 p-3">
                                        {item.quantity}
                                    </td>
                                    <td className="border border-gray-200 p-3">
                                        {item.unitPriceTaxExcl.toFixed(2)}
                                    </td>
                                    <td className="border border-gray-200 p-3">
                                        {item.taxPercent.toFixed(1)}%
                                    </td>
                                    <td className="border border-gray-200 p-3">
                                        {item.totalPriceTaxExcl.toFixed(2)}
                                    </td>
                                    <td className="border border-gray-200 p-3">
                                        {item.totalPriceTaxIncl.toFixed(2)}
                                    </td>
                                    <td className="border border-gray-200 p-3">
                                        <button
                                            className="px-2 py-1 bg-gray-500 text-white rounded"
                                            onClick={() =>
                                                setEditingId(item.id)
                                            }
                                        >
                                            Edit
                                        </button>
                                        <button
                                            className="px-2 py-1 bg-gray-500 text-white rounded"
                                            onClick={() =>
                                                onDeleteItem({ id: item.id })
                                            }
                                        >
                                            Delete
                                        </button>
                                    </td>
                                </tr>
                            ),
                        )}
                        {isAddingNew ? (
                            <EditableLineItem
                                currency={currency}
                                item={{}}
                                onCancel={handleCancelNewItem}
                                onSave={handleSaveNewItem}
                            />
                        ) : null}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
