import {
    FixedIncomeType,
    FixedIncomeTypesTable,
    FixedIncomeTypesTableProps,
} from '@powerhousedao/design-system';
import { copy } from 'copy-anything';
import { utils } from 'document-model/document';
import { useCallback, useState } from 'react';
import {
    FixedIncome,
    actions,
    getDifferences,
    isFixedIncomeAsset,
} from '../../../document-models/real-world-assets';
import { IProps } from '../editor';

export function FixedIncomeTypes(props: IProps) {
    const [expandedRowId, setExpandedRowId] = useState<string>();
    const [selectedItem, setSelectedItem] = useState<FixedIncomeType>();
    const [showNewItemForm, setShowNewItemForm] = useState(false);

    const {
        dispatch,
        document,
        isAllowedToCreateDocuments,
        isAllowedToEditDocuments,
    } = props;

    const fixedIncomeTypes = document.state.global.fixedIncomeTypes;
    const assets = document.state.global.portfolio.filter(a =>
        isFixedIncomeAsset(a),
    ) as FixedIncome[];

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

                const update = copy(selectedItem);
                const newName = data.name;

                if (newName) update.name = newName;

                const changedFields = getDifferences(selectedItem, update);

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
                const id = utils.hashKey();
                const name = data.name;

                if (!name) throw new Error('Name is required');

                dispatch(actions.createFixedIncomeType({ id, name }));
                setShowNewItemForm(false);
            },
            [dispatch],
        );

    const onSubmitDelete: FixedIncomeTypesTableProps['onSubmitDelete'] =
        useCallback(
            (id: string) => {
                dispatch(actions.deleteFixedIncomeType({ id }));
            },
            [dispatch],
        );

    return (
        <FixedIncomeTypesTable
            fixedIncomeTypes={fixedIncomeTypes}
            assets={assets}
            selectedItem={selectedItem}
            showNewItemForm={showNewItemForm}
            expandedRowId={expandedRowId}
            isAllowedToCreateDocuments={isAllowedToCreateDocuments}
            isAllowedToEditDocuments={isAllowedToEditDocuments}
            toggleExpandedRow={toggleExpandedRow}
            setSelectedItem={setSelectedItem}
            setShowNewItemForm={setShowNewItemForm}
            onSubmitEdit={onSubmitEdit}
            onSubmitCreate={onSubmitCreate}
            onSubmitDelete={onSubmitDelete}
        />
    );
}
