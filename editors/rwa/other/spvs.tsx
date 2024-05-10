import { SPV, SPVsTable, SPVsTableProps } from '@powerhousedao/design-system';
import { copy } from 'copy-anything';
import { utils } from 'document-model/document';
import { useCallback, useState } from 'react';
import {
    actions,
    getDifferences,
} from '../../../document-models/real-world-assets';
import { IProps } from '../editor';

export function SPVs(props: IProps) {
    const [expandedRowId, setExpandedRowId] = useState<string>();
    const [selectedItem, setSelectedItem] = useState<SPV>();
    const [showNewItemForm, setShowNewItemForm] = useState(false);

    const {
        dispatch,
        document,
        isAllowedToCreateDocuments,
        isAllowedToEditDocuments,
    } = props;

    const spvs = document.state.global.spvs;

    const toggleExpandedRow = useCallback(
        (id: string | undefined) => {
            setExpandedRowId(curr =>
                curr && curr === expandedRowId ? undefined : id,
            );
        },
        [expandedRowId],
    );

    const onSubmitEdit: SPVsTableProps['onSubmitEdit'] = useCallback(
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
                actions.editSpv({
                    ...changedFields,
                    id: selectedItem.id,
                }),
            );
            setSelectedItem(undefined);
        },
        [dispatch, selectedItem],
    );

    const onSubmitCreate: SPVsTableProps['onSubmitCreate'] = useCallback(
        data => {
            const id = utils.hashKey();
            const name = data.name;

            if (!name) throw new Error('Name is required');

            dispatch(
                actions.createSpv({
                    id,
                    name,
                }),
            );
            setShowNewItemForm(false);
        },
        [dispatch],
    );

    const onSubmitDelete: SPVsTableProps['onSubmitDelete'] = useCallback(
        (id: string) => {
            dispatch(actions.deleteSpv({ id }));
        },
        [dispatch],
    );

    return (
        <SPVsTable
            spvs={spvs}
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
