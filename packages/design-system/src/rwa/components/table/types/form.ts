import {
    GroupTransactionType,
    Item,
    Operation,
    RealWorldAssetsState,
    TableItem,
    TableWrapperProps,
} from '@/rwa';
import { ReactNode } from 'react';
import { FieldValues, UseFormReturn } from 'react-hook-form';

export type ItemDetailsFormProps<
    TFieldValues extends FieldValues = FieldValues,
> = Pick<UseFormReturn<TFieldValues>, 'reset'>;

export type ItemDetailsProps<
    TItem extends Item,
    TFieldValues extends FieldValues,
> = TableWrapperProps<TFieldValues> & {
    tableItem: TableItem<TItem> | undefined;
    itemName: string;
    operation: Operation;
    isAllowedToDeleteItem?: boolean;
    hasDependentItems?: boolean;
    dependentItemProps?: {
        dependentItemName: string;
        dependentItemList: ReactNode[];
    };
    className?: string;
    setOperation: (operation: Operation) => void;
    setSelectedTableItem: <TSelectedTableItem extends TableItem<TItem>>(
        tableItem: TSelectedTableItem | undefined,
    ) => void;
};

export type AssetFormInputs = {
    id?: string;
    fixedIncomeTypeId?: string | null;
    spvId?: string | null;
    maturity?: string | null;
    name?: string | null;
    ISIN?: string | null;
    CUSIP?: string | null;
    coupon?: number | null;
};

export type ServiceProviderFeeTypeFormInputs = {
    id?: string;
    name?: string | null;
    feeType?: string | null;
    accountId?: string | null;
};

export type TransactionFeeInput = {
    id?: string;
    amount?: number | null;
    serviceProviderFeeTypeId?: string | null;
};

export type GroupTransactionFormInputs = {
    id?: string;
    type?: GroupTransactionType;
    entryTime?: string;
    fixedIncomeId?: string | null;
    fees?: TransactionFeeInput[] | null;
    cashAmount?: number | null;
    fixedIncomeAmount?: number | null;
    serviceProviderFeeTypeId?: string | null;
    txRef?: string | null;
};

export type AccountFormInputs = {
    id?: string;
    label?: string | null;
    reference?: string | null;
};

export type SPVFormInputs = {
    id?: string;
    name?: string | null;
};

export type FixedIncomeTypeFormInputs = {
    id?: string;
    name?: string | null;
};

export type FormHookProps<
    TItem extends Item,
    TFieldValues extends FieldValues,
> = {
    item?: TItem | undefined;
    state: RealWorldAssetsState;
    operation: Operation;
    onSubmitCreate: (data: TFieldValues) => void;
    onSubmitEdit?: (data: TFieldValues) => void;
    onSubmitDelete?: (itemId: string) => void;
};
