import {
    Account,
    ServiceProviderFeeType,
    ServiceProviderFeeTypeDetails,
    ServiceProviderFeeTypesTableProps,
    Table,
    addItemNumber,
    getItemById,
} from '@/rwa';
import { useMemo } from 'react';

const columns = [
    { key: 'name' as const, label: 'Name', allowSorting: true },
    { key: 'feeType' as const, label: 'Fee Type', allowSorting: true },
    { key: 'accountName' as const, label: 'Account Name', allowSorting: true },
    {
        key: 'accountReference' as const,
        label: 'Account Reference',
        allowSorting: true,
    },
];

export function makeServiceProviderFeeTypesTableData(
    serviceProviderFeeTypes: ServiceProviderFeeType[] | undefined,
    accounts: Account[] | undefined,
) {
    if (!serviceProviderFeeTypes?.length || !accounts?.length) return [];

    const tableData = serviceProviderFeeTypes.map(serviceProviderFeeType => {
        const account = accounts.find(
            account => account.id === serviceProviderFeeType.accountId,
        );

        return {
            id: serviceProviderFeeType.id,
            name: serviceProviderFeeType.name,
            feeType: serviceProviderFeeType.feeType,
            accountName: account?.label,
            accountReference: account?.reference,
        };
    });

    const withItemNumber = addItemNumber(tableData);

    return withItemNumber;
}

export function ServiceProviderFeeTypesTable(
    props: ServiceProviderFeeTypesTableProps,
) {
    const {
        serviceProviderFeeTypes,
        accounts,
        selectedItem,
        onSubmitCreate,
        onSubmitEdit,
    } = props;

    const itemName = 'Service Provider Fee Type';

    const tableData = useMemo(
        () =>
            makeServiceProviderFeeTypesTableData(
                serviceProviderFeeTypes,
                accounts,
            ),
        [serviceProviderFeeTypes, accounts],
    );
    const editForm = ({
        itemId,
        itemNumber,
    }: {
        itemId: string;
        itemNumber: number;
    }) => (
        <ServiceProviderFeeTypeDetails
            {...props}
            itemName={itemName}
            item={getItemById(itemId, serviceProviderFeeTypes)}
            itemNumber={itemNumber}
            operation={selectedItem?.id === itemId ? 'edit' : 'view'}
            onSubmitForm={onSubmitEdit}
        />
    );

    const createForm = () => (
        <ServiceProviderFeeTypeDetails
            {...props}
            itemName={itemName}
            itemNumber={serviceProviderFeeTypes.length + 1}
            operation="create"
            onSubmitForm={onSubmitCreate}
        />
    );

    return (
        <Table
            {...props}
            itemName={itemName}
            tableData={tableData}
            columns={columns}
            editForm={editForm}
            createForm={createForm}
        />
    );
}
