import {
    ServiceProviderFeeType,
    ServiceProviderFeeTypesTable,
    ServiceProviderFeeTypesTableProps,
} from '@powerhousedao/design-system';
import { copy } from 'copy-anything';
import { utils } from 'document-model/document';
import { useCallback, useState } from 'react';
import {
    actions,
    getDifferences,
} from '../../../document-models/real-world-assets';
import { IProps } from '../editor';

export function ServiceProviderFeeTypes(props: IProps) {
    const [expandedRowId, setExpandedRowId] = useState<string>();
    const [selectedItem, setSelectedItem] = useState<ServiceProviderFeeType>();
    const [showNewItemForm, setShowNewItemForm] = useState(false);

    const {
        dispatch,
        document,
        isAllowedToCreateDocuments,
        isAllowedToEditDocuments,
    } = props;

    const state = document.state.global;

    const toggleExpandedRow = useCallback(
        (id: string | undefined) => {
            setExpandedRowId(curr =>
                curr && curr === expandedRowId ? undefined : id,
            );
        },
        [expandedRowId],
    );

    const onSubmitEdit: ServiceProviderFeeTypesTableProps['onSubmitEdit'] =
        useCallback(
            data => {
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
                    setSelectedItem(undefined);
                    return;
                }

                dispatch(
                    actions.editServiceProviderFeeType({
                        ...changedFields,
                        id: selectedItem.id,
                    }),
                );
                setSelectedItem(undefined);
            },
            [dispatch, selectedItem],
        );

    const onSubmitCreate: ServiceProviderFeeTypesTableProps['onSubmitCreate'] =
        useCallback(
            data => {
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
                setShowNewItemForm(false);
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
            data => {
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
                setShowNewItemForm(false);
            },
            [dispatch],
        );

    return (
        <ServiceProviderFeeTypesTable
            state={state}
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
            onSubmitCreateAccount={onSubmitCreateAccount}
        />
    );
}
