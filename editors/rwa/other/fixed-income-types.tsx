import {
    FixedIncomeType,
    FixedIncomeTypesTable,
    FixedIncomeTypesTableProps,
} from '@powerhousedao/design-system';
import { utils } from 'document-model/document';
import { useCallback, useState } from 'react';
import {
    actions,
    getDifferences,
} from '../../../document-models/real-world-assets';
import { IProps } from '../editor';

export function FixedIncomeTypes(props: IProps) {
    const [expandedRowId, setExpandedRowId] = useState<string>();
    const [selectedItem, setSelectedItem] = useState<FixedIncomeType>();
    const [showNewItemForm, setShowNewItemForm] = useState(false);

    const { dispatch, document } = props;

    const fixedIncomeTypes = document.state.global.fixedIncomeTypes;

    const toggleExpandedRow = useCallback(
        (id: string | undefined) => {
            setExpandedRowId(curr =>
                curr && curr === expandedRowId ? undefined : id,
            );
        },
        [expandedRowId],
    );

    const onSubmitEdit: FixedIncomeTypesTableProps['onSubmitEdit'] =
        useCallback(
            data => {
                if (!selectedItem) return;
                const changedFields = getDifferences(selectedItem, data);

                if (Object.values(changedFields).filter(Boolean).length === 0) {
                    setSelectedItem(undefined);
                    return;
                }

                dispatch(
                    actions.editFixedIncomeType({
                        ...changedFields,
                        id: selectedItem.id,
                    }),
                );
                setSelectedItem(undefined);
            },
            [dispatch, selectedItem],
        );

    const onSubmitCreate: FixedIncomeTypesTableProps['onSubmitCreate'] =
        useCallback(
            data => {
                dispatch(
                    actions.createFixedIncomeType({
                        ...data,
                        id: utils.hashKey(),
                    }),
                );
                setShowNewItemForm(false);
            },
            [dispatch],
        );

    return (
        <FixedIncomeTypesTable
            fixedIncomeTypes={fixedIncomeTypes}
            selectedItem={selectedItem}
            showNewItemForm={showNewItemForm}
            expandedRowId={expandedRowId}
            toggleExpandedRow={toggleExpandedRow}
            setSelectedItem={setSelectedItem}
            setShowNewItemForm={setShowNewItemForm}
            onSubmitEdit={onSubmitEdit}
            onSubmitCreate={onSubmitCreate}
        />
    );
}
