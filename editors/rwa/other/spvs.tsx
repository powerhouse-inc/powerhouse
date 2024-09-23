import { SPVsTable, SPVsTableProps } from '@powerhousedao/design-system';
import { copy } from 'copy-anything';
import { utils } from 'document-model/document';
import { useCallback } from 'react';
import {
    actions,
    getDifferences,
} from '../../../document-models/real-world-assets';
import { IProps } from '../editor';

export function SPVs(props: IProps) {
    const {
        dispatch,
        document,
        isAllowedToCreateDocuments,
        isAllowedToEditDocuments,
    } = props;

    const state = document.state.global;

    const onSubmitEdit: SPVsTableProps['onSubmitEdit'] = useCallback(
        (data) => {
            const selectedItem = state.spvs.find((s) => s.id === data.id);
            if (!selectedItem) return;

            const update = copy(selectedItem);
            const newName = data.name;

            if (newName) update.name = newName;

            const changedFields = getDifferences(selectedItem, update);

            if (Object.values(changedFields).filter(Boolean).length === 0) {
                return;
            }

            dispatch(
                actions.editSpv({
                    ...changedFields,
                    id: selectedItem.id,
                }),
            );
        },
        [dispatch, state.spvs],
    );

    const onSubmitCreate: SPVsTableProps['onSubmitCreate'] = useCallback(
        (data) => {
            const id = utils.hashKey();
            const name = data.name;

            if (!name) throw new Error('Name is required');

            dispatch(
                actions.createSpv({
                    id,
                    name,
                }),
            );
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
            isAllowedToCreateDocuments={isAllowedToCreateDocuments}
            isAllowedToEditDocuments={isAllowedToEditDocuments}
            onSubmitCreate={onSubmitCreate}
            onSubmitDelete={onSubmitDelete}
            onSubmitEdit={onSubmitEdit}
            state={state}
        />
    );
}
