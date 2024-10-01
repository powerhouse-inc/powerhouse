import {
    AccountsTable,
    AccountsTableProps,
} from '@powerhousedao/design-system';
import { copy } from 'copy-anything';
import { utils } from 'document-model/document';
import { useCallback } from 'react';
import {
    actions,
    getDifferences,
} from '../../../document-models/real-world-assets';
import { IProps } from '../editor';

export function Accounts(props: IProps) {
    const {
        dispatch,
        document,
        isAllowedToCreateDocuments,
        isAllowedToEditDocuments,
    } = props;
    const state = document.state.global;

    const onSubmitEdit: AccountsTableProps['onSubmitEdit'] = useCallback(
        (data) => {
            const selectedItem = state.accounts.find((a) => a.id === data.id);
            if (!selectedItem) return;

            const update = copy(selectedItem);
            const newReference = data.reference;
            const newLabel = data.label;

            if (newReference) update.reference = newReference;
            if (newLabel) update.label = newLabel;

            const changedFields = getDifferences(selectedItem, update);

            if (Object.values(changedFields).filter(Boolean).length === 0) {
                return;
            }

            dispatch(
                actions.editAccount({
                    ...changedFields,
                    id: selectedItem.id,
                }),
            );
        },
        [dispatch, state.accounts],
    );

    const onSubmitCreate: AccountsTableProps['onSubmitCreate'] = useCallback(
        (data) => {
            const id = utils.hashKey();
            const reference = data.reference;
            const label = data.label;
            if (!reference) throw new Error('Reference is required');

            dispatch(
                actions.createAccount({
                    id,
                    reference,
                    label,
                }),
            );
        },
        [dispatch],
    );

    const onSubmitDelete: AccountsTableProps['onSubmitDelete'] = useCallback(
        (id) => {
            dispatch(actions.deleteAccount({ id }));
        },
        [dispatch],
    );

    return (
        <AccountsTable
            isAllowedToCreateDocuments={isAllowedToCreateDocuments}
            isAllowedToEditDocuments={isAllowedToEditDocuments}
            onSubmitCreate={onSubmitCreate}
            onSubmitDelete={onSubmitDelete}
            onSubmitEdit={onSubmitEdit}
            state={state}
        />
    );
}
