import {
    FixedIncomeTypesTable,
    FixedIncomeTypesTableProps,
} from '@powerhousedao/design-system';
import { copy } from 'copy-anything';
import { utils } from 'document-model/document';
import { useCallback } from 'react';
import {
    actions,
    getDifferences,
} from '../../../document-models/real-world-assets';
import { IProps } from '../editor';

export function FixedIncomeTypes(props: IProps) {
    const {
        dispatch,
        document,
        isAllowedToCreateDocuments,
        isAllowedToEditDocuments,
    } = props;

    const state = document.state.global;

    const onSubmitEdit: FixedIncomeTypesTableProps['onSubmitEdit'] =
        useCallback(
            (data) => {
                const selectedItem = state.fixedIncomeTypes.find(
                    (f) => f.id === data.id,
                );
                if (!selectedItem) return;

                const update = copy(selectedItem);
                const newName = data.name;

                if (newName) update.name = newName;

                const changedFields = getDifferences(selectedItem, update);

                if (Object.values(changedFields).filter(Boolean).length === 0) {
                    return;
                }

                dispatch(
                    actions.editFixedIncomeType({
                        ...changedFields,
                        id: selectedItem.id,
                    }),
                );
            },
            [dispatch, state.fixedIncomeTypes],
        );

    const onSubmitCreate: FixedIncomeTypesTableProps['onSubmitCreate'] =
        useCallback(
            (data) => {
                const id = utils.hashKey();
                const name = data.name;

                if (!name) throw new Error('Name is required');

                dispatch(actions.createFixedIncomeType({ id, name }));
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
            isAllowedToCreateDocuments={isAllowedToCreateDocuments}
            isAllowedToEditDocuments={isAllowedToEditDocuments}
            onSubmitCreate={onSubmitCreate}
            onSubmitDelete={onSubmitDelete}
            onSubmitEdit={onSubmitEdit}
            state={state}
        />
    );
}
