import {
    ServiceProviderFeeTypesTable,
    ServiceProviderFeeTypesTableProps,
} from '@powerhousedao/design-system';
import { copy } from 'copy-anything';
import { utils } from 'document-model/document';
import { useCallback } from 'react';
import {
    actions,
    getDifferences,
} from '../../../document-models/real-world-assets';
import { IProps } from '../editor';

export function ServiceProviderFeeTypes(props: IProps) {
    const {
        dispatch,
        document,
        isAllowedToCreateDocuments,
        isAllowedToEditDocuments,
    } = props;

    const state = document.state.global;

    const onSubmitEdit: ServiceProviderFeeTypesTableProps['onSubmitEdit'] =
        useCallback(
            (data) => {
                const selectedItem = state.serviceProviderFeeTypes.find(
                    (s) => s.id === data.id,
                );
                if (!selectedItem) return;

                const update = copy(selectedItem);
                const newName = data.name;
                const newAccountId = data.accountId;
                const newFeeType = data.feeType;

                if (newName) update.name = newName;
                if (newAccountId) update.accountId = newAccountId;
                if (newFeeType) update.feeType = newFeeType;

                const changedFields = getDifferences(selectedItem, update);

                if (Object.values(changedFields).filter(Boolean).length === 0) {
                    return;
                }

                dispatch(
                    actions.editServiceProviderFeeType({
                        ...changedFields,
                        id: selectedItem.id,
                    }),
                );
            },
            [dispatch, state.serviceProviderFeeTypes],
        );

    const onSubmitCreate: ServiceProviderFeeTypesTableProps['onSubmitCreate'] =
        useCallback(
            (data) => {
                const id = utils.hashKey();
                const name = data.name;
                const accountId = data.accountId;
                const feeType = data.feeType;

                if (!name) throw new Error('Name is required');
                if (!accountId) throw new Error('Account is required');
                if (!feeType) throw new Error('Fee Type is required');

                dispatch(
                    actions.createServiceProviderFeeType({
                        id,
                        name,
                        accountId,
                        feeType,
                    }),
                );
            },
            [dispatch],
        );

    const onSubmitDelete: ServiceProviderFeeTypesTableProps['onSubmitDelete'] =
        useCallback(
            (id: string) => {
                dispatch(actions.deleteServiceProviderFeeType({ id }));
            },
            [dispatch],
        );

    const onSubmitCreateAccount: ServiceProviderFeeTypesTableProps['onSubmitCreateAccount'] =
        useCallback(
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

    return (
        <ServiceProviderFeeTypesTable
            isAllowedToCreateDocuments={isAllowedToCreateDocuments}
            isAllowedToEditDocuments={isAllowedToEditDocuments}
            onSubmitCreate={onSubmitCreate}
            onSubmitCreateAccount={onSubmitCreateAccount}
            onSubmitDelete={onSubmitDelete}
            onSubmitEdit={onSubmitEdit}
            state={state}
        />
    );
}
